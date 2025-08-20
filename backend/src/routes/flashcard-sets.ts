// routes/flashcard-sets.ts
import { FastifyInstance } from "fastify";
import { authGuard, AuthenticatedRequest } from "../middleware/auth.js";
import { db } from "../db.js";
import { chatJson } from "../services/ai.service.js";
import { z } from "zod";

/* -------------------- MCQ generation core helpers -------------------- */

const DistractorsZ = z.object({
  distractors: z.array(z.string().min(3).max(120)).length(3),
});

const PossibleShapesZ = z.union([
  z.array(z.string().min(3).max(120)).length(3), // pure array
  z.object({ options: z.array(z.string().min(3).max(120)).length(3) }),
  z.object({ distractors: z.array(z.string().min(3).max(120)).length(3) }),
]);

const BAD_OPTION_PATTERNS = [
  /alternative\s*answer/i,
  /^(?:option|réponse)\s*[abc]\b/i,
  /\bnone of the above\b/i,
  /\ball of the above\b/i,
  /\bles deux\b/i,
  /\bles trois\b/i,
  /\bboth\s+a\s+and\s+b\b/i,
  /^(?:a|b|c)\)\s*/i,
  /^\d+\.\s*/,
];

function stripBadOptionText(s: string): string {
  let out = s.trim().replace(/^["“«]|["”»]$/g, "");
  for (const rx of BAD_OPTION_PATTERNS) {
    out = out.replace(rx, "").trim();
  }
  // collapse spaces
  out = out.replace(/\s+/g, " ");
  // remove trailing punctuation duplicates
  out = out.replace(/[.?!…]{2,}$/g, (m) => m[0]);
  return out;
}

function sameCore(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/[\s\-–—_,;:.!?'"“”«»()[\]]+/g, "");
  const nb = b.toLowerCase().replace(/[\s\-–—_,;:.!?'"“”«»()[\]]+/g, "");
  return na === nb;
}

function jaccard(tokensA: string[], tokensB: string[]) {
  const A = new Set(tokensA);
  const B = new Set(tokensB);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.max(1, A.size + B.size - inter);
}
function tokenize(s: string) {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function detectLang(s: string): "fr" | "en" {
  return /[àâäçéèêëîïôöùûüÿœæ]/i.test(s) ||
    /\b(le|la|les|des|une|un|dans|avec|sans|pour|sur|est|sont)\b/i.test(s)
    ? "fr"
    : "en";
}

function coerceDistractorsResponse(raw: any): string[] {
  // Accept array
  if (Array.isArray(raw) && raw.length >= 3) {
    return raw.slice(0, 3);
  }
  // Accept { options: [...] } or { distractors: [...] }
  const parsed = PossibleShapesZ.safeParse(raw);
  if (parsed.success) {
    if (Array.isArray((raw as any).options)) return (raw as any).options;
    if (Array.isArray((raw as any).distractors))
      return (raw as any).distractors;
  }

  // Try to parse code-fenced or raw JSON
  if (typeof raw === "string") {
    const s = raw
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "");
    try {
      const obj = JSON.parse(s);
      const p2 = PossibleShapesZ.safeParse(obj);
      if (p2.success) {
        if (Array.isArray((obj as any).options)) return (obj as any).options;
        if (Array.isArray((obj as any).distractors))
          return (obj as any).distractors;
        return obj as string[];
      }
    } catch {}
  }
  throw new Error("Invalid distractors response format");
}

async function generateDistractorsAI(
  question: string,
  answer: string,
  topic?: string,
  langHint?: string
) {
  const lang =
    (langHint || detectLang(question + " " + answer)) === "fr"
      ? "French"
      : "English";

  const prompt = `You generate distractors (incorrect but plausible options) for multiple-choice questions.
Return ONLY a JSON object with a "distractors" array of exactly 3 strings. No extra text, no code fences.

Constraints:
- Same language as the input (${lang}).
- Each distractor must be 3–120 characters.
- They must be plausible but WRONG relative to the correct answer.
- Never include the correct answer or its exact wording.
- No meta text like "Alternative answer", "Option A/B/C", numbering, or explanations.
- Similar length/complexity as the correct answer.
- Avoid trivial paraphrases or copies; change at least one factual element.

Example:
{
  "distractors": ["Wrong but plausible 1", "Wrong but plausible 2", "Wrong but plausible 3"]
}

Question: "${question}"
Correct Answer: "${answer}"${topic ? `\nTopic: "${topic}"` : ""}

Return ONLY:
{"distractors":["...", "...", "..."]}`;

  const raw = await chatJson([{ role: "user", content: prompt }], true);
  const arr = coerceDistractorsResponse(raw);
  return arr;
}

/* -------------------- Heuristic fallback (no “Alternative answer …”) -------------------- */

function heuristicDistractors(
  answer: string,
  question?: string,
  topic?: string
): string[] {
  const lang = detectLang((question || "") + " " + answer);
  const out: string[] = [];
  const pushIf = (s: string) => {
    const clean = stripBadOptionText(s).slice(0, 120).trim();
    if (!clean) return;
    if (sameCore(clean, answer)) return;
    if (out.some((x) => sameCore(x, clean))) return;
    // too similar token-wise?
    const sim = jaccard(tokenize(clean), tokenize(answer));
    if (sim > 0.92) return;
    out.push(clean);
  };

  // 1) numeric/years tweaks
  const numbers = Array.from(answer.matchAll(/\b(1|2)\d{3}\b/g)).map(
    (m) => m[0]
  ); // years
  if (numbers.length) {
    for (const y of numbers.slice(0, 2)) {
      const year = parseInt(y, 10);
      const variants = [year + 1, year - 1, year + 5];
      for (const v of variants) pushIf(answer.replace(y, String(v)));
      if (out.length >= 3) return out.slice(0, 3);
    }
  } else {
    const nums = Array.from(answer.matchAll(/\b\d+(?:[.,]\d+)?\b/g)).map(
      (m) => m[0]
    );
    if (nums.length) {
      for (const n of nums.slice(0, 2)) {
        const base = parseFloat(n.replace(",", "."));
        const variants = [base * 1.1, base * 0.9, base + 1].map((x) =>
          n.includes(",")
            ? String(x).replace(".", ",")
            : String(Math.round(x * 100) / 100)
        );
        for (const v of variants) pushIf(answer.replace(n, v));
        if (out.length >= 3) return out.slice(0, 3);
      }
    }
  }

  // 2) common-confusion replacements (tech/web-biased, FR/EN)
  const repls: Array<[RegExp, string]> = [
    [/JavaScript\b/gi, "Java"],
    [/ECMAScript\b/gi, lang === "fr" ? "TypeScript" : "TypeScript"],
    [/Node\.?js\b/gi, "Deno"],
    [/Deno\b/gi, "Node.js"],
    [
      /Netscape Navigator\b/gi,
      lang === "fr" ? "Internet Explorer" : "Internet Explorer",
    ],
    [/Brendan Eich\b/gi, lang === "fr" ? "James Gosling" : "James Gosling"],
    [/Mozilla\b/gi, "Microsoft"],
    [/HTML\b/gi, "XML"],
    [/CSS\b/gi, "Sass"],
    [/client(?:-|\s)?side/gi, lang === "fr" ? "côté serveur" : "server-side"],
    [/server(?:-|\s)?side/gi, lang === "fr" ? "côté client" : "client-side"],
  ];
  for (const [rx, rep] of repls) {
    if (rx.test(answer)) {
      const alt = answer.replace(rx, rep);
      pushIf(alt);
    }
    if (out.length >= 3) return out.slice(0, 3);
  }

  // 3) light linguistic perturbations (hedges/quantifiers)—still plausible
  const hedges =
    lang === "fr"
      ? ["approximativement", "principalement", "parfois"]
      : ["approximately", "primarily", "sometimes"];
  for (const h of hedges) {
    pushIf(`${h} ${answer}`);
    if (out.length >= 3) return out.slice(0, 3);
  }

  // 4) final distinct tweaks: swap order of small commas parts
  if (answer.includes(",")) {
    const parts = answer.split(",").map((s) => s.trim());
    if (parts.length >= 2) {
      const swapped = parts.slice().reverse().join(", ");
      pushIf(swapped);
    }
  }

  // pad with clipped variants if still short
  if (out.length < 3) {
    const base = answer.replace(/^["“«]|["”»]$/g, "");
    if (base.length > 20)
      pushIf(base.slice(0, Math.max(10, Math.floor(base.length * 0.7))));
  }
  while (out.length < 3)
    out.push(
      lang === "fr"
        ? "Réponse plausible mais incorrecte"
        : "Plausible but incorrect answer"
    );

  return out.slice(0, 3);
}

/* -------------------- Unified generator (AI + fallback + sanitation) -------------------- */

async function generateMCQForCard(card: {
  question: string;
  answer: string;
  topic?: string;
  language?: string;
}) {
  const question = (card.question || "").trim();
  const answer = (card.answer || "").trim();
  const topic = card.topic?.trim();
  const lang = card.language || detectLang(question + " " + answer);

  let distractors: string[] = [];
  try {
    const rawArr = await generateDistractorsAI(question, answer, topic, lang);
    // sanitize + dedup + validate
    distractors = sanitizeDistractors(rawArr, answer);
    if (distractors.length !== 3)
      throw new Error("AI returned invalid distractors after sanitation");
  } catch (e) {
    console.warn(
      "AI distractor gen failed, using heuristic fallback:",
      (e as Error).message
    );
    distractors = sanitizeDistractors(
      heuristicDistractors(answer, question, topic),
      answer
    );
  }

  // Compose options + shuffle
  const options = fisherYatesShuffle([...distractors, answer]);
  const correctIndex = options.findIndex((o) => sameCore(o, answer));

  return {
    question,
    options,
    correctIndex: Math.max(0, correctIndex),
    explanation:
      (lang === "fr" ? "La bonne réponse est : " : "The correct answer is: ") +
      answer,
    mcqGenerated: true,
  };
}

function sanitizeDistractors(arr: string[], answer: string): string[] {
  const clean: string[] = [];
  for (const opt of arr) {
    let s = stripBadOptionText(opt).slice(0, 120).trim();
    if (!s) continue;
    if (sameCore(s, answer)) continue;
    if (clean.some((x) => sameCore(x, s))) continue;

    // Avoid near duplicates with answer
    const sim = jaccard(tokenize(s), tokenize(answer));
    if (sim > 0.92) continue;

    // avoid "None/All of the above"
    if (/\b(none|all)\s+of\s+the\s+above\b/i.test(s)) continue;

    // basic length
    if (s.length < 3) continue;

    clean.push(s);
    if (clean.length === 3) break;
  }
  return clean;
}

/* -------------------- Routes -------------------- */

export async function flashcardSetsRoutes(fastify: FastifyInstance) {
  // Create a new flashcard set
  fastify.post(
    "/api/flashcard-sets",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;

      const { title, description, language, flashcards } = request.body as {
        title: string;
        description?: string;
        language: string; // "fr" | "en" or "French"/"English"
        flashcards: Array<{ question: string; answer: string; topic: string }>;
      };

      try {
        // Generate MCQ for each flashcard
        const flashcardsWithMCQ = await Promise.all(
          flashcards.map(async (card) => {
            try {
              const res = await generateMCQForCard({
                question: card.question,
                answer: card.answer,
                topic: card.topic,
                language,
              });
              return {
                question: card.question.trim(),
                answer: card.answer.trim(),
                topic: card.topic.trim(),
                mcqOptions: res.options,
                mcqGenerated: true,
              };
            } catch (error) {
              console.error(
                `Error generating MCQ for card "${card.question}":`,
                error
              );
              const fallback = heuristicDistractors(
                card.answer,
                card.question,
                card.topic
              );
              const options = fisherYatesShuffle([
                ...sanitizeDistractors(fallback, card.answer),
                card.answer,
              ]);
              return {
                question: card.question.trim(),
                answer: card.answer.trim(),
                topic: card.topic.trim(),
                mcqOptions: options,
                mcqGenerated: false,
              };
            }
          })
        );

        const flashcardSet = await db.flashcardSet.create({
          data: {
            title,
            description,
            language,
            userId: authRequest.user.id,
            flashcards: {
              create: flashcardsWithMCQ.map((card) => ({
                question: card.question,
                answer: card.answer,
                topic: card.topic,
                mcqOptions: card.mcqOptions,
                mcqGenerated: card.mcqGenerated,
              })),
            },
          },
          include: {
            flashcards: true,
            user: { select: { id: true, name: true, email: true } },
          },
        });

        reply.send({ success: true, data: flashcardSet });
      } catch (error) {
        console.error("Error creating flashcard set:", error);
        reply.status(500).send({
          error: "Failed to create flashcard set",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Get all flashcard sets for the authenticated user
  fastify.get(
    "/api/flashcard-sets",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;

      try {
        const flashcardSets = await db.flashcardSet.findMany({
          where: { userId: authRequest.user.id },
          include: {
            flashcards: true,
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { updatedAt: "desc" },
        });

        reply.send({ success: true, data: flashcardSets });
      } catch (error) {
        console.error("Error fetching flashcard sets:", error);
        reply.status(500).send({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch flashcard sets",
        });
      }
    }
  );

  // Get a specific flashcard set by ID
  fastify.get(
    "/api/flashcard-sets/:id",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };

      try {
        const flashcardSet = await db.flashcardSet.findFirst({
          where: { id, userId: authRequest.user.id },
          include: {
            flashcards: true,
            user: { select: { id: true, name: true, email: true } },
          },
        });

        if (!flashcardSet) {
          return reply.status(404).send({ error: "Flashcard set not found" });
        }

        reply.send({ success: true, data: flashcardSet });
      } catch (error) {
        console.error("Error fetching flashcard set:", error);
        reply.status(500).send({
          error: "Failed to fetch flashcard set",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Update a flashcard set
  fastify.put(
    "/api/flashcard-sets/:id",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };
      const { title, description, language } = request.body as {
        title?: string;
        description?: string;
        language?: string;
      };

      try {
        const existingSet = await db.flashcardSet.findFirst({
          where: { id, userId: authRequest.user.id },
        });

        if (!existingSet) {
          return reply.status(404).send({ error: "Flashcard set not found" });
        }

        const updatedSet = await db.flashcardSet.update({
          where: { id },
          data: {
            ...(title !== undefined && { title }),
            ...(description !== undefined && { description }),
            ...(language !== undefined && { language }),
          },
          include: {
            flashcards: true,
            user: { select: { id: true, name: true, email: true } },
          },
        });

        reply.send({ success: true, data: updatedSet });
      } catch (error) {
        console.error("Error updating flashcard set:", error);
        reply.status(500).send({
          error: "Failed to update flashcard set",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Delete a flashcard set
  fastify.delete(
    "/api/flashcard-sets/:id",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };

      try {
        const existingSet = await db.flashcardSet.findFirst({
          where: { id, userId: authRequest.user.id },
        });

        if (!existingSet) {
          return reply.status(404).send({ error: "Flashcard set not found" });
        }

        await db.flashcardSet.delete({ where: { id } });

        reply.send({
          success: true,
          message: "Flashcard set deleted successfully",
        });
      } catch (error) {
        console.error("Error deleting flashcard set:", error);
        reply.status(500).send({
          error: "Failed to delete flashcard set",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Generate multiple choice options for a flashcard (single)
  fastify.post(
    "/api/flashcards/generate-mcq",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const { question, answer, topic, language } = request.body as {
        question: string;
        answer: string;
        topic?: string;
        language?: string;
      };

      if (!question || !answer) {
        return reply
          .status(400)
          .send({ error: "Question and answer are required" });
      }

      try {
        const res = await generateMCQForCard({
          question,
          answer,
          topic,
          language,
        });
        reply.send({
          success: true,
          data: {
            question,
            options: res.options,
            correctIndex: res.correctIndex,
            explanation: res.explanation,
          },
        });
      } catch (error) {
        console.error("Error generating MCQ:", error);

        const fallback = heuristicDistractors(answer, question, topic);
        const options = fisherYatesShuffle([
          ...sanitizeDistractors(fallback, answer),
          answer,
        ]);
        const correctIndex = options.findIndex((o) => sameCore(o, answer));

        reply.send({
          success: true,
          data: {
            question,
            options,
            correctIndex: Math.max(0, correctIndex),
            explanation: `The correct answer is: ${answer}`,
            fallback: true,
          },
          warning: "Used fallback MCQ generation due to AI error",
        });
      }
    }
  );
}
