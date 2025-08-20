import { cleanOcr, chunkText, hashQuestion } from "../utils/text-utils.js";
import { mapPrompt, reducePrompt } from "../utils/prompts.js";
import { chatJson } from "./ai.service.js";
import { z } from "zod";

// Stricter schemas + sanitation to avoid junky Q/A
const MapCardZ = z.object({
  q: z.string().min(6).max(240),
  a: z.string().min(1).max(240),
  topic: z.string().min(2).max(120),
});
const MapCardsZ = z.array(MapCardZ);

const FinalCardZ = z.object({
  q: z.string().min(6).max(180),
  a: z.string().min(1).max(120),
  topic: z.string().min(2).max(120),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});
const FinalCardsZ = z.array(FinalCardZ).min(1).max(50);

// Guard words we never want in a question
const BAD_Q_PATTERNS = [
  /(?:choose|pick|select)\s*(?:one|the best|a|an)\s*(?:answer|option)/i,
  /(?:answer|option)\s*[ABC]\b/i,
  /alternative\s*answer/i,
  /true\/false/i,
  /\b(all|none)\s+of\s+the\s+above\b/i,
  /\b(les|choisir)\s*(?:bon|meilleur)\s*(?:réponse|option)/i,
];

function sanitizeQuestion(q: string): string {
  let s = q.trim();
  // Remove list bullets/numbers prefixes
  s = s.replace(/^\s*[\-\*\d]+\)\s*/g, "").replace(/^\s*\d+\.\s*/g, "");
  // Ensure question mark for interrogatives (if it reads like a question)
  if (
    !/[.?!…]$/.test(s) &&
    /^(who|what|when|where|why|how|comment|quel|quelle|quels|quelles|pourquoi|quand)\b/i.test(
      s
    )
  ) {
    s += "?";
  }
  // Strip bad patterns
  for (const rx of BAD_Q_PATTERNS) {
    if (rx.test(s)) s = s.replace(rx, "").trim();
  }
  return s;
}

function sanitizeAnswer(a: string): string {
  let s = a.trim().replace(/^[:\-–—]\s*/, "");
  // Kill meta
  s = s.replace(/^(Correct\s*Answer|Réponse\s*correcte)\s*:\s*/i, "");
  // Trim enclosing quotes
  s = s.replace(/^["“«]|["”»]$/g, "");
  return s.trim();
}

function isBadQuestion(q: string): boolean {
  return BAD_Q_PATTERNS.some((rx) => rx.test(q));
}

function normalizeCard(c: z.infer<typeof MapCardZ>) {
  const q = sanitizeQuestion(c.q);
  const a = sanitizeAnswer(c.a);
  const topic = c.topic.trim();
  return { q, a, topic };
}

export async function generateFromOcr(
  rawText: string,
  finalCount = 24,
  lang = "French"
) {
  const cleaned = cleanOcr(rawText);
  const chunks = chunkText(cleaned, 1800, 200);

  // MAP
  const candidates: Array<z.infer<typeof MapCardZ>> = [];
  for (const ch of chunks) {
    const content = await chatJson([
      { role: "user", content: mapPrompt(ch, 6, lang) },
    ]);
    const arr = MapCardsZ.safeParse(content);
    if (arr.success) {
      for (const c of arr.data) {
        const norm = normalizeCard(c);
        if (
          !isBadQuestion(norm.q) &&
          norm.q.length >= 6 &&
          norm.a.length >= 1
        ) {
          candidates.push(norm);
        }
      }
    }
  }

  // DEDUP (normalize the hash a bit more aggressively)
  const byKey = new Map<string, z.infer<typeof MapCardZ>>();
  for (const c of candidates) {
    const k = hashQuestion(c.q.toLowerCase().replace(/\s+/g, " ").trim());
    if (!byKey.has(k)) byKey.set(k, c);
  }
  const unique = Array.from(byKey.values());

  // REDUCE via AI if too many
  let finalArr: any = unique;
  if (unique.length > finalCount) {
    const payload = JSON.stringify(unique).slice(0, 40_000);
    const reducedJson = await chatJson(
      [{ role: "user", content: reducePrompt(payload, finalCount, lang) }],
      true
    );
    // Expect reducedJson to be an array of {q,a,topic,?difficulty}
    if (Array.isArray(reducedJson)) {
      finalArr = reducedJson.map((c: any) => normalizeCard(c));
    }
  }

  // Final validation & trimming punctuation/lengths
  const checked = FinalCardsZ.safeParse(finalArr);
  if (!checked.success) throw new Error("Invalid final cards");
  return checked.data.map((c) => ({
    ...c,
    q: c.q.trim().slice(0, 180),
    a: c.a.trim().slice(0, 120),
  }));
}
