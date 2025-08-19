import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authGuard, AuthenticatedRequest } from "../middleware/auth.js";
import { generateSummary, validateSummaryInput } from "../services/summary.service.js";
import { db } from "../db.js";

const CreateSummarySchema = z.object({
  title: z.string().min(1).max(255),
  originalText: z.string().min(50).max(50000),
  language: z.string().optional().default("English"),
  flashcardSetId: z.string().optional(),
});

const UpdateSummarySchema = z.object({
  title: z.string().min(1).max(255).optional(),
  originalText: z.string().min(50).max(50000).optional(),
  summary: z.string().optional(),
  keyPoints: z.any().optional(), // JSON data
  language: z.string().optional(),
  flashcardSetId: z.string().optional(),
});

export async function studySummariesRoutes(fastify: FastifyInstance) {
  // Create a new study summary
  fastify.post(
    "/api/study-summaries",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      
      try {
        const { title, originalText, language, flashcardSetId } = CreateSummarySchema.parse(request.body);

        // Validate input text
        const validation = validateSummaryInput(originalText);
        if (!validation.valid) {
          return reply.status(400).send({
            success: false,
            error: validation.message
          });
        }

        // If flashcardSetId is provided, verify it belongs to the user
        if (flashcardSetId) {
          const flashcardSet = await db.flashcardSet.findFirst({
            where: {
              id: flashcardSetId,
              userId: authRequest.user.id
            }
          });

          if (!flashcardSet) {
            return reply.status(404).send({
              success: false,
              error: "Flashcard set not found"
            });
          }
        }

        // Generate AI summary
        const summaryResult = await generateSummary(originalText, language);

        // Create study summary in database
        const studySummary = await db.studySummary.create({
          data: {
            title,
            originalText,
            summary: summaryResult.summary,
            keyPoints: summaryResult.keyPoints,
            language,
            userId: authRequest.user.id,
            flashcardSetId: flashcardSetId || null,
          },
          include: {
            user: {
              select: { id: true, name: true, email: true }
            },
            flashcardSet: {
              select: { id: true, title: true }
            }
          }
        });

        reply.send({
          success: true,
          data: studySummary
        });

      } catch (error) {
        console.error("Error creating study summary:", error);
        
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: "Invalid input",
            details: error.issues
          });
        }

        reply.status(500).send({
          success: false,
          error: "Failed to create study summary",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  // Get all study summaries for the authenticated user
  fastify.get(
    "/api/study-summaries",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;

      try {
        const summaries = await db.studySummary.findMany({
          where: {
            userId: authRequest.user.id
          },
          include: {
            user: {
              select: { id: true, name: true, email: true }
            },
            flashcardSet: {
              select: { id: true, title: true }
            }
          },
          orderBy: {
            updatedAt: 'desc'
          }
        });

        reply.send({
          success: true,
          data: summaries
        });

      } catch (error) {
        console.error("Error fetching study summaries:", error);
        reply.status(500).send({
          success: false,
          error: "Failed to fetch study summaries",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  // Get a specific study summary by ID
  fastify.get(
    "/api/study-summaries/:id",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };

      try {
        const summary = await db.studySummary.findFirst({
          where: {
            id,
            userId: authRequest.user.id // Ensure user can only access their own summaries
          },
          include: {
            user: {
              select: { id: true, name: true, email: true }
            },
            flashcardSet: {
              select: { id: true, title: true, flashcards: true }
            }
          }
        });

        if (!summary) {
          return reply.status(404).send({
            success: false,
            error: "Study summary not found"
          });
        }

        reply.send({
          success: true,
          data: summary
        });

      } catch (error) {
        console.error("Error fetching study summary:", error);
        reply.status(500).send({
          success: false,
          error: "Failed to fetch study summary",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  // Update a study summary
  fastify.put(
    "/api/study-summaries/:id",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };

      try {
        const updateData = UpdateSummarySchema.parse(request.body);

        // Check if summary exists and belongs to user
        const existingSummary = await db.studySummary.findFirst({
          where: {
            id,
            userId: authRequest.user.id
          }
        });

        if (!existingSummary) {
          return reply.status(404).send({
            success: false,
            error: "Study summary not found"
          });
        }

        // If originalText is being updated, regenerate summary
        let newSummaryData = {};
        if (updateData.originalText && updateData.originalText !== existingSummary.originalText) {
          const validation = validateSummaryInput(updateData.originalText);
          if (!validation.valid) {
            return reply.status(400).send({
              success: false,
              error: validation.message
            });
          }

          const summaryResult = await generateSummary(
            updateData.originalText, 
            updateData.language || existingSummary.language
          );

          newSummaryData = {
            summary: summaryResult.summary,
            keyPoints: summaryResult.keyPoints
          };
        }

        // Update summary
        const updatedSummary = await db.studySummary.update({
          where: { id },
          data: {
            ...updateData,
            ...newSummaryData,
            updatedAt: new Date()
          },
          include: {
            user: {
              select: { id: true, name: true, email: true }
            },
            flashcardSet: {
              select: { id: true, title: true }
            }
          }
        });

        reply.send({
          success: true,
          data: updatedSummary
        });

      } catch (error) {
        console.error("Error updating study summary:", error);
        
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: "Invalid input",
            details: error.issues
          });
        }

        reply.status(500).send({
          success: false,
          error: "Failed to update study summary",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  // Delete a study summary
  fastify.delete(
    "/api/study-summaries/:id",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };

      try {
        // Check if summary exists and belongs to user
        const existingSummary = await db.studySummary.findFirst({
          where: {
            id,
            userId: authRequest.user.id
          }
        });

        if (!existingSummary) {
          return reply.status(404).send({
            success: false,
            error: "Study summary not found"
          });
        }

        await db.studySummary.delete({
          where: { id }
        });

        reply.send({
          success: true,
          message: "Study summary deleted successfully"
        });

      } catch (error) {
        console.error("Error deleting study summary:", error);
        reply.status(500).send({
          success: false,
          error: "Failed to delete study summary",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  // Generate summary from text (without saving)
  fastify.post(
    "/api/study-summaries/generate",
    { preHandler: [authGuard] },
    async (request, reply) => {
      try {
        const { text, language = "English" } = request.body as { text: string; language?: string };

        // Validate input
        const validation = validateSummaryInput(text);
        if (!validation.valid) {
          return reply.status(400).send({
            success: false,
            error: validation.message
          });
        }

        // Generate summary
        const summaryResult = await generateSummary(text, language);

        reply.send({
          success: true,
          data: summaryResult
        });

      } catch (error) {
        console.error("Error generating summary:", error);
        reply.status(500).send({
          success: false,
          error: "Failed to generate summary",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );
}