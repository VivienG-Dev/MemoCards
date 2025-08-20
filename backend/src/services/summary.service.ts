import { chatJson } from "./ai.service.js";

export interface KeyPoint {
  text: string;
  startPos: number; // UTF-16 index (inclusive)
  endPos: number; // UTF-16 index (end-exclusive)
  importance: "high" | "medium" | "low";
  category: "definition" | "fact" | "concept" | "example" | "warning";
}

export interface SummaryResult {
  summary: string;
  keyPoints: KeyPoint[];
}

type LanguageCode = "auto" | "en" | "fr";
type EffectiveLang = "en" | "fr";

type AIKeyPhrase = {
  text: string;
  startPos?: number;
  endPos?: number;
  importance: "high" | "medium" | "low";
  category: "definition" | "fact" | "concept" | "example" | "warning";
};

type AIResponse = {
  summary: string;
  keyPhrases: AIKeyPhrase[];
};

// ---- Tunables ---------------------------------------------------------------

const CHARS_PER_TOKEN = 4;
const MAX_TOKENS = 3000;
const CHUNK_OVERLAP = 200;
const MIN_KP = 8;
const MAX_KP = 15;

// Limits for normalized phrases
const MIN_PHRASE_LEN = 10;
const MAX_PHRASE_LEN = 220;

// i18n (no H1/H2 duplication in UI)
const i18nStrings = {
  en: {
    mainPoints: "## Main Points",
    conclusion: "## Conclusion",
    part: "Part",
  },
  fr: {
    mainPoints: "## Points Principaux",
    conclusion: "## Conclusion",
    part: "Partie",
  },
};

// ---- Public API -------------------------------------------------------------

export async function generateSummary(
  text: string,
  language: string = "auto"
): Promise<SummaryResult> {
  const inputCheck = validateSummaryInput(text);
  if (!inputCheck.valid) {
    throw new Error(inputCheck.message || "Invalid input.");
  }

  const promptLang = normalizeLanguage(language);
  const effectiveLang: EffectiveLang =
    promptLang === "auto" ? inferLanguage(text) : promptLang;

  const estTokens = Math.ceil(text.length / CHARS_PER_TOKEN);
  console.log(
    `[summary] start: chars=${text.length}, estTokens≈${estTokens}, promptLang=${promptLang}, effectiveLang=${effectiveLang}`
  );

  try {
    if (estTokens > MAX_TOKENS) {
      console.log("[summary] using chunked mode");
      return await generateChunkedSummary(text, promptLang, effectiveLang);
    }
    return await generateSingleSummary(text, promptLang);
  } catch (err) {
    console.error("[summary] Falling back. Reason:", (err as Error)?.message);
    return generateEnhancedFallback(text, effectiveLang);
  }
}

// ---- Core: Single-pass & Chunked -------------------------------------------

async function generateSingleSummary(
  text: string,
  langCode: LanguageCode
): Promise<SummaryResult> {
  const prompt = createSummaryPrompt(text, langCode);

  const raw = await chatJson(
    [{ role: "user", content: prompt }],
    false,
    "summary"
  );
  const response = coerceAIResponse(raw);

  return processSummaryResponse(response, text);
}

async function generateChunkedSummary(
  text: string,
  promptLang: LanguageCode,
  effectiveLang: EffectiveLang
): Promise<SummaryResult> {
  const chunkSize = MAX_TOKENS * CHARS_PER_TOKEN;
  const chunks = chunkTextWithOffsets(text, chunkSize, CHUNK_OVERLAP);
  console.log(
    `[summary] chunks: count=${chunks.length}, size≈${chunkSize}, overlap=${CHUNK_OVERLAP}`
  );

  const chunkSummaries: { summary: string; keyPoints: KeyPoint[] }[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const { text: chunk, startOffset } = chunks[i];
    try {
      const res = await generateSingleSummary(chunk, promptLang);
      const adjusted = res.keyPoints.map((kp) => ({
        ...kp,
        startPos: kp.startPos + startOffset,
        endPos: kp.endPos + startOffset,
      }));
      chunkSummaries.push({ summary: res.summary, keyPoints: adjusted });
    } catch (e) {
      console.warn(`[summary] chunk ${i + 1}/${chunks.length} failed:`, e);
    }
  }

  if (chunkSummaries.length === 0) {
    console.warn("[summary] All chunks failed → fallback");
    return generateEnhancedFallback(text, effectiveLang);
  }

  return mergeChunkSummaries(chunkSummaries, effectiveLang);
}

// ---- Prompting --------------------------------------------------------------

function createSummaryPrompt(text: string, langCode: LanguageCode): string {
  const languageInstruction =
    langCode === "auto"
      ? "Detect and maintain the original language of the input."
      : `Generate the response in ${langCode === "fr" ? "French" : "English"}.`;

  return `You are a precise study assistant. Create a comprehensive summary with highlighted key phrases.

CRITICAL:
- Return ONLY valid JSON. No prose, no comments, no extra text.
- Do NOT wrap the JSON in code fences.
- All indices MUST be UTF-16 code unit offsets as used by JavaScript strings.

${languageInstruction}
- Summary length: target 20–40% of the original, but NEVER exceed ~800 words.
- Use short section headings (e.g., "Main Points", "Key Concepts", "Important Details").
- Maintain academic accuracy and fidelity to the input.

Key phrases (CRITICAL - read carefully):
- EXACTLY ${MIN_KP}–${MAX_KP} phrases.
- Each phrase must be a COMPLETE, MEANINGFUL unit from the input text (prefer full sentences).
- NEVER output partial fragments like "Quelques jours avant sa sortie, Netscape change le".
- If the sentence is very long, pick a whole clause that ends naturally (before ; , : — or . ! ? …).
- Each phrase must be an exact substring of the input text.
- Provide BOTH startPos and endPos (end-exclusive), in UTF-16 indices for the COMPLETE phrase.
- No duplicates (unique by text+startPos) and no overlapping spans.

Return ONLY this JSON:
{
  "summary": string,
  "keyPhrases": [
    {
      "text": string,
      "startPos": number,
      "endPos": number,
      "importance": "high"|"medium"|"low",
      "category": "definition"|"fact"|"concept"|"example"|"warning"
    }
  ]
}

INPUT START
<<TEXT_START>>
${text}
<<TEXT_END>>
INPUT END`;
}

// ---- JSON Coercion (avoid fallback on formatting) --------------------------

function coerceAIResponse(raw: unknown): AIResponse {
  if (
    raw &&
    typeof raw === "object" &&
    "summary" in (raw as any) &&
    "keyPhrases" in (raw as any)
  ) {
    return raw as AIResponse;
  }

  if (typeof raw === "string") {
    const s = stripCodeFence(raw.trim());
    const parsed = tryParseJsonObject(s) ?? extractFirstJsonObject(s);
    if (parsed) return parsed;
  }

  if (
    raw &&
    typeof raw === "object" &&
    "content" in (raw as any) &&
    typeof (raw as any).content === "string"
  ) {
    const s = stripCodeFence(((raw as any).content as string).trim());
    const parsed = tryParseJsonObject(s) ?? extractFirstJsonObject(s);
    if (parsed) return parsed;
  }

  try {
    const s = stripCodeFence(String(raw ?? ""));
    const parsed = tryParseJsonObject(s) ?? extractFirstJsonObject(s);
    if (parsed) return parsed;
  } catch {}

  throw new Error("Unable to coerce AI response into JSON");
}

function stripCodeFence(s: string): string {
  return s
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "");
}

function tryParseJsonObject(s: string): AIResponse | null {
  try {
    const parsed = JSON.parse(s);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as any).summary === "string" &&
      Array.isArray((parsed as any).keyPhrases)
    ) {
      return parsed as AIResponse;
    }
  } catch {}
  return null;
}

function extractFirstJsonObject(s: string): AIResponse | null {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return tryParseJsonObject(s.slice(start, end + 1));
  }
  return null;
}

// ---- Response processing ----------------------------------------------------

type Span = { start: number; end: number };

function overlaps(a: Span, b: Span) {
  return a.start < b.end && b.start < a.end;
}

function processSummaryResponse(
  response: AIResponse,
  originalText: string
): SummaryResult {
  if (!response || typeof response !== "object") {
    throw new Error("Invalid AI response (not an object)");
  }
  if (!response.summary || typeof response.summary !== "string") {
    throw new Error("AI did not generate a valid summary");
  }
  if (!Array.isArray(response.keyPhrases)) {
    throw new Error("AI did not generate valid key phrases");
  }

  const keyPoints: KeyPoint[] = [];
  const takenSpans: Span[] = [];

  for (const phrase of response.keyPhrases) {
    if (!isValidPhraseSkeleton(phrase)) continue;

    const kp = placeAndNormalizePhrase(phrase, originalText, takenSpans);
    if (kp) {
      keyPoints.push(kp);
      takenSpans.push({ start: kp.startPos, end: kp.endPos });
    }
  }

  if (keyPoints.length < MIN_KP) {
    const needed = MIN_KP - keyPoints.length;
    keyPoints.push(
      ...extractFallbackKeyPoints(originalText, needed, takenSpans)
    );
  }

  return {
    summary: response.summary.trim(),
    keyPoints: keyPoints.slice(0, MAX_KP),
  };
}

// Only check basic structure; real content is normalized later
function isValidPhraseSkeleton(phrase: any): phrase is AIKeyPhrase {
  return (
    phrase &&
    typeof phrase.text === "string" &&
    ["high", "medium", "low"].includes(phrase.importance) &&
    ["definition", "fact", "concept", "example", "warning"].includes(
      phrase.category
    )
  );
}

// Main placement + normalization pipeline
function placeAndNormalizePhrase(
  phrase: AIKeyPhrase,
  fullText: string,
  taken: Span[]
): KeyPoint | null {
  const raw = phrase.text.trim();
  if (!raw) return null;

  // 1) Try model offsets if they match the exact substring
  if (Number.isInteger(phrase.startPos) && Number.isInteger(phrase.endPos)) {
    const s = phrase.startPos as number;
    const e = phrase.endPos as number;
    if (
      s >= 0 &&
      e > s &&
      e <= fullText.length &&
      fullText.slice(s, e) === raw
    ) {
      // Normalize this span to sentence/clause bounds
      let norm = normalizeSpanToSentenceOrClause(fullText, {
        start: s,
        end: e,
      });
      norm = clampSpanLength(fullText, norm, MIN_PHRASE_LEN, MAX_PHRASE_LEN);

      if (!taken.some((t) => overlaps(t, norm))) {
        const text = fullText.slice(norm.start, norm.end).trim();
        if (text.length >= MIN_PHRASE_LEN) {
          return {
            text,
            startPos: norm.start,
            endPos: norm.end,
            importance: phrase.importance,
            category: phrase.category,
          };
        }
      }
    }
  }

  // 2) Fallback: locate the phrase anywhere (global), then normalize
  const rx = new RegExp(escapeRegex(raw), "g");
  let m: RegExpExecArray | null;
  while ((m = rx.exec(fullText))) {
    let span: Span = { start: m.index, end: m.index + raw.length };

    // Normalize to sentence/clause
    span = normalizeSpanToSentenceOrClause(fullText, span);
    span = clampSpanLength(fullText, span, MIN_PHRASE_LEN, MAX_PHRASE_LEN);

    if (!taken.some((t) => overlaps(t, span))) {
      const text = fullText.slice(span.start, span.end).trim();
      if (text.length >= MIN_PHRASE_LEN) {
        return {
          text,
          startPos: span.start,
          endPos: span.end,
          importance: phrase.importance,
          category: phrase.category,
        };
      }
    }
  }

  console.warn(`[summary] Could not place phrase: "${raw}"`);
  return null;
}

// ---- Span normalization -----------------------------------------------------

// Expand a span outward to align with sentence or clause boundaries.
function normalizeSpanToSentenceOrClause(text: string, span: Span): Span {
  let { start, end } = span;

  // Expand left to previous boundary
  start = findLeftBoundary(text, start);

  // Expand right to next boundary
  end = findRightBoundary(text, end);

  // Trim whitespace/guillemets/quotes at both ends
  ({ start, end } = trimSoft(text, start, end));

  return { start, end };
}

// Find left boundary at sentence start or after [.!?…] + space/quote/newline or double newline
function findLeftBoundary(text: string, index: number): number {
  if (index <= 0) return 0;

  // Scan backwards to last clear boundary
  let i = index;
  while (i > 0) {
    const ch = text[i - 1];
    if (isSentenceTerminator(ch)) {
      // Move forward past quotes/spaces
      let j = i;
      while (j < text.length && isClosingQuoteOrSpace(text[j])) j++;
      return j;
    }
    // Double newline is a hard boundary
    if (i >= 2 && text[i - 1] === "\n" && text[i - 2] === "\n") {
      return i;
    }
    i--;
  }
  return 0;
}

// Find right boundary at the end of sentence/clause or before double newline
function findRightBoundary(text: string, index: number): number {
  if (index >= text.length) return text.length;

  let i = index;
  while (i < text.length) {
    const ch = text[i];

    // End at hard sentence terminators
    if (isSentenceTerminator(ch)) {
      i++; // include the terminator
      // include trailing quotes/parens
      while (i < text.length && isClosingQuoteOrParen(text[i])) i++;
      return i;
    }

    // Clause-level terminators - allow as a natural finish if the span is already long enough
    if (isClauseTerminator(ch)) {
      // stop at ; : , — if span length is at least some minimal size
      const len = i - index;
      if (len >= 40) {
        i++;
        while (i < text.length && isClosingQuoteOrParen(text[i])) i++;
        return i;
      }
    }

    // Double newline is a hard boundary
    if (i + 1 < text.length && text[i] === "\n" && text[i + 1] === "\n") {
      return i;
    }

    i++;
  }
  return text.length;
}

function isSentenceTerminator(ch: string): boolean {
  return (
    ch === "." ||
    ch === "!" ||
    ch === "?" ||
    ch === "…" ||
    ch === "…".normalize()
  );
}
function isClauseTerminator(ch: string): boolean {
  return ch === ";" || ch === ":" || ch === "," || ch === "—" || ch === "–";
}
function isClosingQuoteOrParen(ch: string): boolean {
  return (
    ch === '"' ||
    ch === "”" ||
    ch === "»" ||
    ch === ")" ||
    ch === "]" ||
    ch === "’" ||
    ch === "'"
  );
}
function isClosingQuoteOrSpace(ch: string): boolean {
  return isClosingQuoteOrParen(ch) || ch === " " || ch === "\t";
}

// Remove leading/trailing spaces and wrap chars (« » “ ” " ) ’ )
function trimSoft(text: string, start: number, end: number): Span {
  // Left trim
  while (start < end && /\s/.test(text[start])) start++;
  while (start < end && isOpeningQuoteOrParen(text[start])) start++;

  // Right trim
  while (end > start && /\s/.test(text[end - 1])) end--;
  while (end > start && isClosingQuoteOrParen(text[end - 1])) end--;

  // Ensure we didn't cut sentence punctuation; if we did, re-add one char
  if (end > start && !isSentenceTerminator(text[end - 1])) {
    // ok to end on letter/number
  } else if (end > start && isSentenceTerminator(text[end - 1])) {
    // good
  }
  return { start, end };
}
function isOpeningQuoteOrParen(ch: string): boolean {
  return (
    ch === '"' ||
    ch === "“" ||
    ch === "«" ||
    ch === "(" ||
    ch === "[" ||
    ch === "‘"
  );
}

// If too short or too long, clamp intelligently to a sentence end close-by
function clampSpanLength(
  text: string,
  span: Span,
  minLen: number,
  maxLen: number
): Span {
  let { start, end } = span;
  let len = end - start;

  if (len < minLen) {
    // Try extend right to next terminator to grow
    const newEnd = findRightBoundary(text, end);
    if (newEnd - start >= minLen && newEnd - start <= maxLen) {
      end = newEnd;
      return trimSoft(text, start, end);
    }
    // else extend left a bit
    const newStart = findLeftBoundary(text, start);
    if (end - newStart >= minLen && end - newStart <= maxLen) {
      start = newStart;
      return trimSoft(text, start, end);
    }
  } else if (len > maxLen) {
    // Try cut at first terminator after start within maxLen window
    const cut = findFirstTerminatorAfter(text, start, maxLen);
    if (cut > start) {
      end = cut;
      return trimSoft(text, start, end);
    }
  }
  return trimSoft(text, start, end);
}

function findFirstTerminatorAfter(
  text: string,
  start: number,
  maxLen: number
): number {
  const limit = Math.min(text.length, start + maxLen);
  for (let i = start; i < limit; i++) {
    if (isSentenceTerminator(text[i])) {
      let j = i + 1;
      while (j < text.length && isClosingQuoteOrParen(text[j])) j++;
      return j;
    }
  }
  // No terminator found; return limit as a soft cap on clause length
  return limit;
}

// ---- Chunking utilities -----------------------------------------------------

function chunkTextWithOffsets(
  text: string,
  maxChars: number,
  overlap = CHUNK_OVERLAP
) {
  const out: { text: string; startOffset: number }[] = [];
  if (text.length <= maxChars) return [{ text, startOffset: 0 }];

  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    out.push({ text: text.slice(start, end), startOffset: start });
    if (end === text.length) break;
    start = Math.max(0, end - overlap);
  }
  return out;
}

// ---- Merging chunk results --------------------------------------------------

function mergeChunkSummaries(
  chunks: { summary: string; keyPoints: KeyPoint[] }[],
  lang: EffectiveLang
): SummaryResult {
  const s = i18nStrings[lang];
  let merged = "";

  chunks.forEach((c, i) => {
    merged += `### ${s.part} ${i + 1}\n\n${c.summary}\n\n`;
  });

  const unique = deduplicateKeyPoints(chunks.flatMap((c) => c.keyPoints)).slice(
    0,
    MAX_KP
  );
  return { summary: merged.trim(), keyPoints: unique };
}

function deduplicateKeyPoints(keyPoints: KeyPoint[]): KeyPoint[] {
  const seen = new Map<string, KeyPoint>();
  for (const kp of keyPoints) {
    const key = `${kp.text}@@${kp.startPos}`;
    if (!seen.has(key)) seen.set(key, kp);
  }
  return Array.from(seen.values()).sort((a, b) => a.startPos - b.startPos);
}

// ---- Fallback summary & extraction (prefers full sentences) ----------------

function generateEnhancedFallback(
  text: string,
  lang: EffectiveLang
): SummaryResult {
  console.log("[summary] generating enhanced fallback");
  const s = i18nStrings[lang];

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 30);
  let summary = `${s.mainPoints}\n\n`;

  paragraphs.slice(0, 4).forEach((p, i) => {
    const sentences = splitIntoSentences(p);
    const first = sentences
      .find((z) => z.length >= 30 && z.length <= 180)
      ?.trim();
    if (first) {
      summary += `**${i + 1}. ${first}**\n\n`;
    }
  });

  if (paragraphs.length > 1) {
    const lastP = paragraphs[paragraphs.length - 1];
    const conclusion = splitIntoSentences(lastP)
      .find((z) => z.length >= 20)
      ?.trim();
    if (conclusion) summary += `${s.conclusion}\n\n${conclusion}\n`;
  }

  const keyPoints = extractFallbackKeyPoints(text, MAX_KP, []);
  return { summary: summary.trim(), keyPoints };
}

function extractFallbackKeyPoints(
  text: string,
  maxPoints: number,
  takenSpans: Span[]
): KeyPoint[] {
  const keyPoints: KeyPoint[] = [];

  const tryAdd = (
    start: number,
    end: number,
    kp: Omit<KeyPoint, "startPos" | "endPos">
  ) => {
    const span = clampSpanLength(
      text,
      { start, end },
      MIN_PHRASE_LEN,
      MAX_PHRASE_LEN
    );
    if (!takenSpans.some((t) => overlaps(t, span))) {
      const t = text.slice(span.start, span.end).trim();
      if (t.length >= MIN_PHRASE_LEN) {
        keyPoints.push({
          ...kp,
          text: t,
          startPos: span.start,
          endPos: span.end,
        });
        takenSpans.push(span);
        return true;
      }
    }
    return false;
  };

  // Strategy 1: pick complete sentences across the whole text
  const allSentences = splitIntoSentences(text);
  for (const s of allSentences) {
    if (s.length >= 30 && s.length <= 180) {
      const idx = text.indexOf(s);
      if (idx !== -1) {
        if (
          tryAdd(idx, idx + s.length, {
            text: s,
            importance: "high",
            category: "fact",
          })
        ) {
          if (keyPoints.length >= Math.min(MIN_KP, maxPoints)) break;
        }
      }
    }
  }

  // Strategy 2: quoted sentences
  if (keyPoints.length < maxPoints) {
    const quotes = [
      ...(text.match(/"([^"]{10,200})"/g) || []),
      ...(text.match(/“([^”]{10,200})”/g) || []),
      ...(text.match(/«([^»]{10,200})»/g) || []),
    ]
      .map((q) => q.replace(/^["“«]|["”»]$/g, ""))
      .filter((q) => q.length >= 20 && q.length <= 200);

    for (const q of quotes) {
      const idx = text.indexOf(q);
      if (idx !== -1) {
        if (
          tryAdd(idx, idx + q.length, {
            text: q,
            importance: "high",
            category: "definition",
          })
        ) {
          if (keyPoints.length >= maxPoints) break;
        }
      }
    }
  }

  // Strategy 3: paragraph-leading sentence if missing
  if (keyPoints.length < maxPoints) {
    const paragraphs = text
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 50);
    for (const p of paragraphs.slice(0, 6)) {
      const s = splitIntoSentences(p).find(
        (z) => z.length >= 25 && z.length <= 160
      );
      if (s) {
        const idx = text.indexOf(s);
        if (idx !== -1) {
          if (
            tryAdd(idx, idx + s.length, {
              text: s,
              importance: "medium",
              category: "fact",
            })
          ) {
            if (keyPoints.length >= maxPoints) break;
          }
        }
      }
    }
  }

  return deduplicateKeyPoints(keyPoints).slice(0, maxPoints);
}

// ---- Utilities --------------------------------------------------------------

export function validateSummaryInput(text: string): {
  valid: boolean;
  message?: string;
} {
  if (!text || typeof text !== "string") {
    return { valid: false, message: "Text is required" };
  }
  const trimmed = text.trim();
  if (trimmed.length < 50) {
    return {
      valid: false,
      message: "Text is too short. Please provide at least 50 characters.",
    };
  }
  if (trimmed.length > 50000) {
    return {
      valid: false,
      message: "Text is too long. Please provide less than 50,000 characters.",
    };
  }
  const words = trimmed.split(/\s+/).filter((w) => w.length > 2);
  if (words.length < 20) {
    return {
      valid: false,
      message: "Text doesn't contain enough meaningful content.",
    };
  }
  return { valid: true };
}

function normalizeLanguage(language: string): LanguageCode {
  const lang = (language || "").toLowerCase();
  if (lang === "fr" || lang === "french" || lang === "français") return "fr";
  if (lang === "en" || lang === "english") return "en";
  return "auto";
}

function inferLanguage(text: string): EffectiveLang {
  const frHints =
    /[àâäçéèêëîïôöùûüÿœæ]|(^|\s)(les|des|une|dans|avec|sans|pour|sur|ce|cette|ces|est|sont)(\s|[,.!?;:])/i;
  return frHints.test(text) ? "fr" : "en";
}

function splitIntoSentences(txt: string): string[] {
  // Split on sentence punctuation (., !, ?, …) while keeping the punctuation attached.
  // Then trim; reject super-short fragments.
  const parts: string[] = [];
  let buf = "";
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    buf += ch;
    if (isSentenceTerminator(ch)) {
      // Include following closing quotes/parens
      let j = i + 1;
      while (j < txt.length && isClosingQuoteOrParen(txt[j])) {
        buf += txt[j];
        i = j;
        j++;
      }
      parts.push(buf.trim());
      buf = "";
    } else if (ch === "\n" && i + 1 < txt.length && txt[i + 1] === "\n") {
      if (buf.trim().length) parts.push(buf.trim());
      buf = "";
    }
  }
  if (buf.trim().length) parts.push(buf.trim());
  // Filter tiny pieces
  return parts.filter((s) => s.length > 10);
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
