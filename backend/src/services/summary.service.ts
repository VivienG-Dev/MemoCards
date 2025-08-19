import { chatJson } from "./ai.service.js";

export interface KeyPoint {
  text: string;
  startPos: number;
  endPos: number;
  importance: 'high' | 'medium' | 'low';
  category: 'definition' | 'fact' | 'concept' | 'example' | 'warning';
}

export interface SummaryResult {
  summary: string;
  keyPoints: KeyPoint[];
}

type LanguageCode = 'auto' | 'en' | 'fr';

// Token estimation: roughly 4 characters per token
const CHARS_PER_TOKEN = 4;
const MAX_TOKENS = 3000; // Leave room for response
const CHUNK_OVERLAP = 200; // Overlap between chunks to maintain context

// i18n strings
const i18nStrings = {
  en: {
    automaticSummary: "# Automatic Summary",
    technicalIssue: "*Note: This summary was generated automatically due to a technical issue.*",
    mainPoints: "## Main Points",
    conclusion: "## Conclusion",
  },
  fr: {
    automaticSummary: "# Résumé Automatique", 
    technicalIssue: "*Note: Ce résumé a été généré automatiquement suite à un problème technique.*",
    mainPoints: "## Points Principaux",
    conclusion: "## Conclusion",
  }
};

export async function generateSummary(
  text: string, 
  language: string = "auto"
): Promise<SummaryResult> {
  if (!text || text.trim().length < 50) {
    throw new Error("Text is too short for summarization. Please provide at least 50 characters.");
  }

  if (text.length > 50000) {
    throw new Error("Text is too long for summarization. Please provide less than 50,000 characters.");
  }

  const normalizedLang = normalizeLanguage(language);
  console.log(`Starting summary generation for ${text.length} characters, language: ${normalizedLang}`);

  try {
    // Check if text needs chunking based on token estimation
    const estimatedTokens = Math.ceil(text.length / CHARS_PER_TOKEN);
    
    if (estimatedTokens > MAX_TOKENS) {
      console.log(`Text too large (${estimatedTokens} tokens), using chunking strategy`);
      return await generateChunkedSummary(text, normalizedLang);
    }

    // Single-pass generation for smaller texts
    return await generateSingleSummary(text, normalizedLang);

  } catch (error) {
    console.error("Error generating summary:", error);
    
    // Enhanced fallback
    const fallbackSummary = generateEnhancedFallback(text, normalizedLang);
    return fallbackSummary;
  }
}

async function generateSingleSummary(text: string, langCode: LanguageCode): Promise<SummaryResult> {
  const prompt = createSummaryPrompt(text, langCode);
  
  const response = await chatJson([
    {
      role: "user",
      content: prompt
    }
  ], false, 'summary');

  console.log('AI Summary Response:', {
    hasSummary: !!response?.summary,
    summaryLength: response?.summary?.length,
    hasKeyPhrases: !!response?.keyPhrases,
    keyPhrasesCount: response?.keyPhrases?.length
  });

  return processSummaryResponse(response, text);
}

async function generateChunkedSummary(text: string, langCode: LanguageCode): Promise<SummaryResult> {
  const chunks = chunkText(text, MAX_TOKENS * CHARS_PER_TOKEN);
  console.log(`Processing ${chunks.length} chunks`);
  
  const chunkSummaries: { summary: string; keyPoints: KeyPoint[] }[] = [];
  let currentOffset = 0;
  
  // Process each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`Processing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);
    
    try {
      const chunkResult = await generateSingleSummary(chunk, langCode);
      
      // Adjust key point positions for chunk offset
      const adjustedKeyPoints = chunkResult.keyPoints.map(kp => ({
        ...kp,
        startPos: kp.startPos + currentOffset,
        endPos: kp.endPos + currentOffset
      }));
      
      chunkSummaries.push({
        summary: chunkResult.summary,
        keyPoints: adjustedKeyPoints
      });
      
    } catch (error) {
      console.warn(`Failed to process chunk ${i + 1}:`, error);
      // Continue with other chunks
    }
    
    currentOffset += chunk.length - (i < chunks.length - 1 ? CHUNK_OVERLAP : 0);
  }
  
  // Merge chunk results
  return mergeChunkSummaries(chunkSummaries, langCode);
}

function normalizeLanguage(language: string): LanguageCode {
  const lang = language.toLowerCase();
  if (lang === 'french' || lang === 'fr' || lang === 'français') return 'fr';
  if (lang === 'english' || lang === 'en') return 'en';
  return 'auto';
}

function createSummaryPrompt(text: string, langCode: LanguageCode): string {
  const languageInstruction = langCode === 'auto' 
    ? "Detect and maintain the original language of the text"
    : `Generate the response in ${langCode === 'fr' ? 'French' : 'English'}`;

  return `You are a study assistant. Create a comprehensive summary with highlighted key phrases.

CRITICAL: Return ONLY valid JSON. No prose, no explanations, no additional text.

Text to summarize:
\`\`\`
${text}
\`\`\`

Instructions:
1. Create an organized summary (maximum 800 words, 20-40% of original length)
2. Use clear sections with headings (Main Points, Key Concepts, etc.)
3. ${languageInstruction}
4. Maintain academic accuracy

5. Identify EXACTLY 8-15 key phrases with precise character positions:
   - Important definitions and terminology  
   - Critical facts and data points
   - Main concepts and theories
   - Key examples and applications
   - Warnings or important information

6. For each phrase, provide the exact startPos (character offset from beginning of text)
7. Ensure phrases are 3-80 characters long
8. No overlapping phrases, no duplicates

Return ONLY this JSON structure:
{
  "summary": "organized multi-paragraph summary with headings",
  "keyPhrases": [
    {
      "text": "exact phrase from original text",
      "startPos": number,
      "importance": "high|medium|low", 
      "category": "definition|fact|concept|example|warning"
    }
  ]
}`;
}

function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split(/\n\s*\n/);
  
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed the limit
    if (currentChunk.length + paragraph.length > maxChars - CHUNK_OVERLAP) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        // Start new chunk with overlap
        currentChunk = currentChunk.slice(-CHUNK_OVERLAP) + '\n\n' + paragraph;
      } else {
        // Single paragraph is too long, split by sentences
        const sentences = splitIntoSentences(paragraph);
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length > maxChars - CHUNK_OVERLAP) {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = sentence;
          } else {
            currentChunk += ' ' + sentence;
          }
        }
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

function splitIntoSentences(text: string): string[] {
  // Better sentence splitting that handles French punctuation
  return text
    .replace(/([.!?])\s+/g, '$1|SPLIT|')
    .split('|SPLIT|')
    .filter(s => s.trim().length > 10);
}

function processSummaryResponse(response: any, originalText: string): SummaryResult {
  // Validate response structure
  if (!response || typeof response !== 'object') {
    throw new Error("Invalid response format from AI");
  }

  if (!response.summary || typeof response.summary !== 'string') {
    throw new Error("AI did not generate a valid summary");
  }

  if (!response.keyPhrases || !Array.isArray(response.keyPhrases)) {
    throw new Error("AI did not generate valid key phrases");
  }

  // Process key phrases with robust position mapping
  const keyPoints: KeyPoint[] = [];
  const usedPositions = new Set<number>();
  
  for (const phrase of response.keyPhrases) {
    if (!isValidPhrase(phrase)) {
      console.warn('Skipping invalid key phrase:', phrase);
      continue;
    }

    const keyPoint = findBestPhrasePosition(phrase, originalText, usedPositions);
    if (keyPoint) {
      keyPoints.push(keyPoint);
      usedPositions.add(keyPoint.startPos);
    }
  }

  // Ensure we have at least some key points
  if (keyPoints.length < 3) {
    console.warn('Too few key points found, supplementing with fallback extraction');
    const fallbackPoints = extractFallbackKeyPoints(originalText, 8 - keyPoints.length);
    keyPoints.push(...fallbackPoints);
  }

  console.log(`Successfully generated summary with ${keyPoints.length} key points`);

  return {
    summary: response.summary.trim(),
    keyPoints: keyPoints.slice(0, 15) // Hard limit
  };
}

function isValidPhrase(phrase: any): boolean {
  return phrase && 
    typeof phrase.text === 'string' &&
    phrase.text.length >= 3 &&
    phrase.text.length <= 80 &&
    ['high', 'medium', 'low'].includes(phrase.importance) &&
    ['definition', 'fact', 'concept', 'example', 'warning'].includes(phrase.category);
}

function findBestPhrasePosition(phrase: any, text: string, usedPositions: Set<number>): KeyPoint | null {
  const phraseText = phrase.text.trim();
  
  // Try exact position if provided by AI
  if (typeof phrase.startPos === 'number' && phrase.startPos >= 0) {
    const endPos = phrase.startPos + phraseText.length;
    if (endPos <= text.length && text.substring(phrase.startPos, endPos) === phraseText) {
      if (!hasOverlap(phrase.startPos, endPos, usedPositions)) {
        return {
          text: phraseText,
          startPos: phrase.startPos,
          endPos,
          importance: phrase.importance,
          category: phrase.category
        };
      }
    }
  }
  
  // Fallback: find phrase with regex (case-sensitive, whole word when possible)
  const escapedPhrase = phraseText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escapedPhrase}\\b|${escapedPhrase}`, 'g');
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    const startPos = match.index;
    const endPos = startPos + phraseText.length;
    
    if (!hasOverlap(startPos, endPos, usedPositions)) {
      return {
        text: phraseText,
        startPos,
        endPos,
        importance: phrase.importance,
        category: phrase.category
      };
    }
  }
  
  console.warn(`Could not find position for phrase: "${phraseText}"`);
  return null;
}

function hasOverlap(startPos: number, endPos: number, usedPositions: Set<number>): boolean {
  // Check for overlap with existing positions (simple approach)
  for (let pos = startPos; pos < endPos; pos++) {
    if (usedPositions.has(pos)) return true;
  }
  return false;
}

function mergeChunkSummaries(chunkSummaries: { summary: string; keyPoints: KeyPoint[] }[], langCode: LanguageCode): SummaryResult {
  const strings = langCode === 'fr' ? i18nStrings.fr : i18nStrings.en;
  
  let mergedSummary = strings.automaticSummary + '\n\n';
  const allKeyPoints: KeyPoint[] = [];
  
  // Combine summaries
  chunkSummaries.forEach((chunk, index) => {
    mergedSummary += `### Part ${index + 1}\n\n${chunk.summary}\n\n`;
    allKeyPoints.push(...chunk.keyPoints);
  });
  
  // Deduplicate and limit key points
  const uniqueKeyPoints = deduplicateKeyPoints(allKeyPoints).slice(0, 15);
  
  return {
    summary: mergedSummary.trim(),
    keyPoints: uniqueKeyPoints
  };
}

function deduplicateKeyPoints(keyPoints: KeyPoint[]): KeyPoint[] {
  const seen = new Map<string, KeyPoint>();
  
  for (const kp of keyPoints) {
    const key = `${kp.text}-${kp.startPos}`;
    if (!seen.has(key)) {
      seen.set(key, kp);
    }
  }
  
  return Array.from(seen.values()).sort((a, b) => a.startPos - b.startPos);
}

function generateEnhancedFallback(text: string, langCode: LanguageCode): SummaryResult {
  console.log('Generating enhanced fallback summary for AI failure');
  
  const strings = langCode === 'fr' ? i18nStrings.fr : i18nStrings.en;
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 30);
  
  // Create enhanced fallback summary
  let summary = `${strings.automaticSummary}\n\n${strings.technicalIssue}\n\n${strings.mainPoints}\n\n`;

  // Better paragraph processing
  paragraphs.slice(0, 4).forEach((paragraph, index) => {
    const sentences = splitIntoSentences(paragraph);
    const firstSentence = sentences[0]?.trim();
    const secondSentence = sentences[1]?.trim();
    
    if (firstSentence) {
      summary += `**${index + 1}. ${firstSentence}**\n`;
      if (secondSentence && sentences.length > 2) {
        summary += `   ${secondSentence}\n`;
      }
      summary += "\n";
    }
  });

  // Add conclusion if available
  if (paragraphs.length > 1) {
    const lastParagraph = paragraphs[paragraphs.length - 1];
    const conclusion = splitIntoSentences(lastParagraph)[0]?.trim();
    if (conclusion) {
      summary += `${strings.conclusion}\n\n${conclusion}\n`;
    }
  }

  // Generate key points using multiple strategies
  const keyPoints = extractFallbackKeyPoints(text, 12);

  console.log(`Enhanced fallback generated: ${summary.length} chars, ${keyPoints.length} key points`);

  return {
    summary: summary.trim(),
    keyPoints
  };
}

function extractFallbackKeyPoints(text: string, maxPoints: number): KeyPoint[] {
  const keyPoints: KeyPoint[] = [];
  const usedPositions = new Set<number>();
  
  // Strategy 1: Important capitalized terms (avoid common sentence starters)
  const sentenceStarters = new Set(['The', 'This', 'That', 'These', 'Those', 'A', 'An', 'In', 'On', 'At', 'For', 'To', 'From', 'By', 'With', 'Without', 'Le', 'La', 'Les', 'Un', 'Une', 'Des', 'Dans', 'Sur', 'Avec', 'Sans']);
  
  const capitalizedTerms = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  const goodTerms = [...new Set(capitalizedTerms)]
    .filter(term => 
      term.length > 3 && 
      term.length < 50 && 
      !sentenceStarters.has(term.split(' ')[0])
    )
    .slice(0, Math.ceil(maxPoints / 3));
  
  goodTerms.forEach(term => {
    const startPos = text.indexOf(term);
    if (startPos !== -1 && !hasOverlap(startPos, startPos + term.length, usedPositions)) {
      keyPoints.push({
        text: term,
        startPos,
        endPos: startPos + term.length,
        importance: 'high',
        category: 'concept'
      });
      usedPositions.add(startPos);
    }
  });

  // Strategy 2: Quoted text and definitions
  const quotedText = text.match(/"([^"]{10,70})"/g) || [];
  quotedText.slice(0, Math.ceil(maxPoints / 4)).forEach(quote => {
    const cleanQuote = quote.replace(/"/g, '');
    const startPos = text.indexOf(cleanQuote);
    if (startPos !== -1 && !hasOverlap(startPos, startPos + cleanQuote.length, usedPositions)) {
      keyPoints.push({
        text: cleanQuote,
        startPos,
        endPos: startPos + cleanQuote.length,
        importance: 'high',
        category: 'definition'
      });
      usedPositions.add(startPos);
    }
  });

  // Strategy 3: Key phrases from paragraph beginnings
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 50);
  paragraphs.slice(0, 6).forEach(paragraph => {
    const words = paragraph.trim().split(/\s+/);
    if (words.length >= 5) {
      const keyPhrase = words.slice(0, Math.min(7, words.length)).join(' ');
      const startPos = text.indexOf(keyPhrase);
      if (startPos !== -1 && 
          keyPhrase.length > 20 && 
          keyPhrase.length < 80 &&
          !hasOverlap(startPos, startPos + keyPhrase.length, usedPositions)) {
        keyPoints.push({
          text: keyPhrase,
          startPos,
          endPos: startPos + keyPhrase.length,
          importance: 'medium',
          category: 'fact'
        });
        usedPositions.add(startPos);
      }
    }
  });

  // Ensure we have enough points, fill with meaningful terms
  if (keyPoints.length < 8) {
    const additionalTerms = text.match(/\b\w{6,25}\b/g) || [];
    const meaningfulTerms = [...new Set(additionalTerms)]
      .filter(term => !term.match(/^\d+$/) && term.length > 5)
      .slice(0, 8 - keyPoints.length);
      
    meaningfulTerms.forEach(term => {
      const startPos = text.indexOf(term);
      if (startPos !== -1 && !hasOverlap(startPos, startPos + term.length, usedPositions)) {
        keyPoints.push({
          text: term,
          startPos,
          endPos: startPos + term.length,
          importance: 'low',
          category: 'concept'
        });
        usedPositions.add(startPos);
      }
    });
  }

  // Remove duplicates and sort by position
  return deduplicateKeyPoints(keyPoints).slice(0, maxPoints);
}

export function validateSummaryInput(text: string): { valid: boolean; message?: string } {
  if (!text || typeof text !== 'string') {
    return { valid: false, message: "Text is required" };
  }

  const trimmedText = text.trim();
  
  if (trimmedText.length < 50) {
    return { valid: false, message: "Text is too short. Please provide at least 50 characters for meaningful summarization." };
  }

  if (trimmedText.length > 50000) {
    return { valid: false, message: "Text is too long. Please provide less than 50,000 characters." };
  }

  // Check if text has enough substance (not just repeated characters or very simple content)
  const words = trimmedText.split(/\s+/).filter(word => word.length > 2);
  if (words.length < 20) {
    return { valid: false, message: "Text doesn't contain enough meaningful content. Please provide more detailed text." };
  }

  return { valid: true };
}