import { FastifyInstance } from "fastify";
import { authGuard, AuthenticatedRequest } from "../middleware/auth.js";
import { db } from "../db.js";
import { chatJson } from "../services/ai.service.js";

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
        language: string;
        flashcards: Array<{ question: string; answer: string; topic: string }>;
      };

      try {
        // Generate MCQ options for each flashcard
        const flashcardsWithMCQ = await Promise.all(
          flashcards.map(async (card) => {
            try {
              // Generate MCQ options using AI
              const prompt = `You are creating multiple choice questions for a study app.

Question: "${card.question}"
Correct Answer: "${card.answer}"
Topic: "${card.topic}"

Generate exactly 3 incorrect but plausible options that:
1. Are related to the topic and could reasonably confuse someone studying
2. Are similar in length and complexity to the correct answer
3. Are not obviously wrong or nonsensical
4. Test actual understanding rather than just guessing

Return ONLY a JSON array of the 3 incorrect options, nothing else.

Example format: ["option1", "option2", "option3"]`;

              const response = await chatJson([
                {
                  role: "user",
                  content: prompt
                }
              ], true);

              // Parse the response - it should be an array of 3 strings
              let mcqOptions: string[] = [];
              
              if (Array.isArray(response)) {
                mcqOptions = response.slice(0, 3); // Take first 3 options
              } else if (response.options && Array.isArray(response.options)) {
                mcqOptions = response.options.slice(0, 3);
              } else if (response.distractors && Array.isArray(response.distractors)) {
                mcqOptions = response.distractors.slice(0, 3);
              } else {
                throw new Error("Invalid response format from AI");
              }

              // Validate we have 3 options and they're all strings
              if (mcqOptions.length !== 3 || !mcqOptions.every(opt => typeof opt === 'string' && opt.trim())) {
                throw new Error("AI did not generate exactly 3 valid options");
              }

              return {
                question: card.question,
                answer: card.answer,
                topic: card.topic,
                mcqOptions,
                mcqGenerated: true
              };
            } catch (error) {
              console.error(`Error generating MCQ for card "${card.question}":`, error);
              
              // Fallback: create generic options
              const fallbackOptions = [
                `Alternative answer A`,
                `Alternative answer B`,
                `Alternative answer C`
              ];
              
              return {
                question: card.question,
                answer: card.answer,
                topic: card.topic,
                mcqOptions: fallbackOptions,
                mcqGenerated: false // Mark as fallback
              };
            }
          })
        );

        // Create flashcard set with flashcards including MCQ options
        const flashcardSet = await db.flashcardSet.create({
          data: {
            title,
            description,
            language,
            userId: authRequest.user.id,
            flashcards: {
              create: flashcardsWithMCQ.map(card => ({
                question: card.question,
                answer: card.answer,
                topic: card.topic,
                mcqOptions: card.mcqOptions,
                mcqGenerated: card.mcqGenerated,
              }))
            }
          },
          include: {
            flashcards: true,
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        });

        reply.send({
          success: true,
          data: flashcardSet
        });
      } catch (error) {
        console.error("Error creating flashcard set:", error);
        reply.status(500).send({
          error: "Failed to create flashcard set",
          message: error instanceof Error ? error.message : "Unknown error"
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
          where: {
            userId: authRequest.user.id
          },
          include: {
            flashcards: true,
            user: {
              select: { id: true, name: true, email: true }
            }
          },
          orderBy: {
            updatedAt: 'desc'
          }
        });

        reply.send({
          success: true,
          data: flashcardSets
        });
      } catch (error) {
        console.error("Error fetching flashcard sets:", error);
        reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : "Failed to fetch flashcard sets",
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
          where: {
            id,
            userId: authRequest.user.id // Ensure user can only access their own sets
          },
          include: {
            flashcards: true,
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        });

        if (!flashcardSet) {
          return reply.status(404).send({
            error: "Flashcard set not found"
          });
        }

        reply.send({
          success: true,
          data: flashcardSet
        });
      } catch (error) {
        console.error("Error fetching flashcard set:", error);
        reply.status(500).send({
          error: "Failed to fetch flashcard set",
          message: error instanceof Error ? error.message : "Unknown error"
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
        // First check if the set exists and belongs to the user
        const existingSet = await db.flashcardSet.findFirst({
          where: {
            id,
            userId: authRequest.user.id
          }
        });

        if (!existingSet) {
          return reply.status(404).send({
            error: "Flashcard set not found"
          });
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
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        });

        reply.send({
          success: true,
          data: updatedSet
        });
      } catch (error) {
        console.error("Error updating flashcard set:", error);
        reply.status(500).send({
          error: "Failed to update flashcard set",
          message: error instanceof Error ? error.message : "Unknown error"
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
        // First check if the set exists and belongs to the user
        const existingSet = await db.flashcardSet.findFirst({
          where: {
            id,
            userId: authRequest.user.id
          }
        });

        if (!existingSet) {
          return reply.status(404).send({
            error: "Flashcard set not found"
          });
        }

        await db.flashcardSet.delete({
          where: { id }
        });

        reply.send({
          success: true,
          message: "Flashcard set deleted successfully"
        });
      } catch (error) {
        console.error("Error deleting flashcard set:", error);
        reply.status(500).send({
          error: "Failed to delete flashcard set",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  // Generate multiple choice options for a flashcard
  fastify.post(
    "/api/flashcards/generate-mcq",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const { question, answer, topic } = request.body as {
        question: string;
        answer: string;
        topic?: string;
      };

      if (!question || !answer) {
        return reply.status(400).send({
          error: "Question and answer are required"
        });
      }

      try {
        const prompt = `You are creating multiple choice questions for a study app.

Question: "${question}"
Correct Answer: "${answer}"
${topic ? `Topic: "${topic}"` : ''}

Generate exactly 3 incorrect but plausible options that:
1. Are related to the topic and could reasonably confuse someone studying
2. Are similar in length and complexity to the correct answer
3. Are not obviously wrong or nonsensical
4. Test actual understanding rather than just guessing

Return ONLY a JSON array of the 3 incorrect options, nothing else.

Example format: ["option1", "option2", "option3"]`;

        const response = await chatJson([
          {
            role: "user",
            content: prompt
          }
        ], true); // Use json_object mode for simple array response

        // Parse the response - it should be an array of 3 strings
        let options: string[] = [];
        
        if (Array.isArray(response)) {
          options = response.slice(0, 3); // Take first 3 options
        } else if (response.options && Array.isArray(response.options)) {
          options = response.options.slice(0, 3);
        } else if (response.distractors && Array.isArray(response.distractors)) {
          options = response.distractors.slice(0, 3);
        } else {
          throw new Error("Invalid response format from AI");
        }

        // Validate we have 3 options and they're all strings
        if (options.length !== 3 || !options.every(opt => typeof opt === 'string' && opt.trim())) {
          throw new Error("AI did not generate exactly 3 valid options");
        }

        // Create the full MCQ with randomized order
        const allOptions = [...options, answer];
        const shuffled = allOptions.sort(() => Math.random() - 0.5);
        const correctIndex = shuffled.indexOf(answer);

        reply.send({
          success: true,
          data: {
            question,
            options: shuffled,
            correctIndex,
            explanation: `The correct answer is: ${answer}`
          }
        });

      } catch (error) {
        console.error("Error generating MCQ:", error);
        
        // Fallback: create simple generic distractors
        const fallbackOptions = [
          "Option A (generated)",
          "Option B (generated)", 
          "Option C (generated)",
          answer
        ].sort(() => Math.random() - 0.5);
        
        const correctIndex = fallbackOptions.indexOf(answer);

        reply.send({
          success: true,
          data: {
            question,
            options: fallbackOptions,
            correctIndex,
            explanation: `The correct answer is: ${answer}`,
            fallback: true
          },
          warning: "Used fallback MCQ generation due to AI error"
        });
      }
    }
  );
}