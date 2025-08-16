export const mapPrompt = (chunk: string, n = 6, lang = "French") => `
You are a cautious flashcard generator.
From ONLY the text below, create up to ${n} Q/A flashcards in ${lang}.

Rules:
- One fact per card, precise question
- Answer <= 15 words. If unsure, SKIP
- Output JSON array: [{"q":"...","a":"...","topic":"..."}]

TEXT:
"""${chunk}"""`;

export const reducePrompt = (
  candidatesJson: string,
  finalCount = 24,
  lang = "French"
) => `
You are a reviewer selecting the best flashcards in ${lang}.
Given the candidate cards JSON, return the best ${finalCount}, balanced across topics.
Fix minor grammar only. Add difficulty: easy|medium|hard.

Schema: [{"q":"...","a":"...","topic":"...","difficulty":"easy|medium|hard"}]

CANDIDATES:
"""${candidatesJson}"""`;