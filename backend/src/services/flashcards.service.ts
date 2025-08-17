import { cleanOcr, chunkText, hashQuestion } from "../utils/text-utils.js";
import { mapPrompt, reducePrompt } from "../utils/prompts.js";
import { chatJson } from "./ai.service.js";
import { z } from "zod";

const MapCardZ = z.object({
  q: z.string(),
  a: z.string(),
  topic: z.string(), // Make required to match JSON schema
});
const MapCardsZ = z.array(MapCardZ);

const FinalCardZ = z.object({
  q: z.string().min(6).max(180),
  a: z.string().min(1).max(120),
  topic: z.string(), // Make required to match JSON schema
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});
const FinalCardsZ = z.array(FinalCardZ).min(1).max(50);

export async function generateFromOcr(
  rawText: string,
  finalCount = 24,
  lang = "French"
) {
  const cleaned = cleanOcr(rawText);
  const chunks = chunkText(cleaned, 1800, 200);

  // MAP
  const candidates: any[] = [];
  for (const ch of chunks) {
    const content = await chatJson([
      { role: "user", content: mapPrompt(ch, 6, lang) },
    ]);
    const arr = MapCardsZ.safeParse(content);
    if (arr.success) candidates.push(...arr.data);
  }

  // DEDUP local
  const byKey = new Map<string, any>();
  for (const c of candidates) {
    const k = hashQuestion(c.q);
    if (!byKey.has(k)) byKey.set(k, c);
  }
  const unique = Array.from(byKey.values());

  // REDUCE (AI) if too many cards
  let finalArr = unique;
  if (unique.length > finalCount) {
    const reducedJson = await chatJson(
      [
        {
          role: "user",
          content: reducePrompt(
            JSON.stringify(unique).slice(0, 40_000),
            finalCount,
            lang
          ),
        },
      ],
      true
    );
    try {
      finalArr = reducedJson; // reducedJson is already parsed
    } catch {
      // Fall back to unique if parsing fails
    }
  }

  // Final validation
  const checked = FinalCardsZ.safeParse(finalArr);
  if (!checked.success) throw new Error("Invalid final cards");
  return checked.data;
}