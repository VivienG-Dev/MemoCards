import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authGuard, AuthenticatedRequest } from '../middleware/auth.js'
import { generateFromOcr } from '../services/flashcards.service.js'

const GenerateFromOcrSchema = z.object({
  text: z.string().min(10).max(50000),
  finalCount: z.number().min(5).max(50).optional().default(24),
  lang: z.string().optional().default("French"),
})

export async function flashcardsRoutes(fastify: FastifyInstance) {
  // Generate flashcards from OCR text
  fastify.post('/api/flashcards/from-ocr', {
    preHandler: [authGuard],
    schema: {
      body: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', minLength: 10, maxLength: 50000 },
          finalCount: { type: 'number', minimum: 5, maximum: 50, default: 24 },
          lang: { type: 'string', default: "French" }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            cards: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  q: { type: 'string' },
                  a: { type: 'string' },
                  topic: { type: 'string' },
                  difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] }
                }
              }
            },
            userId: { type: 'string' },
            processedChunks: { type: 'number' }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply) => {
    try {
      const { text, finalCount, lang } = GenerateFromOcrSchema.parse(request.body)
      
      const cards = await generateFromOcr(text, finalCount, lang)
      
      return {
        cards,
        userId: request.user.id,
        processedChunks: Math.ceil(text.length / 1800)
      }
    } catch (error) {
      request.log.error('Error generating flashcards:', error)
      
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ 
          error: 'Invalid input', 
          details: error.errors 
        })
      }
      
      return reply.status(500).send({ 
        error: 'Failed to generate flashcards',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })
}