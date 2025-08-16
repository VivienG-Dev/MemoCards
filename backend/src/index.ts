import Fastify from 'fastify'
import cors from '@fastify/cors'
import { auth } from './auth.js'
import { authGuard, AuthenticatedRequest } from './middleware/auth.js'
import { flashcardsRoutes } from './routes/flashcards.js'

const fastify = Fastify({
  logger: true
})

await fastify.register(cors, {
  origin: ['http://localhost:8081', 'exp://localhost:8081'],
  credentials: true
})

// Better Auth routes
fastify.all('/api/auth/*', async (request, reply) => {
  return auth.handler(request.raw, reply.raw)
})

fastify.get('/', async () => {
  return { message: 'Flashcards API is running!' }
})

fastify.get('/health', async () => {
  return { status: 'healthy', timestamp: new Date().toISOString() }
})

// Protected test route
fastify.get('/api/me', { preHandler: [authGuard] }, async (request: AuthenticatedRequest) => {
  return { 
    user: request.user,
    message: 'You are authenticated!' 
  }
})

// Register flashcards routes
await fastify.register(flashcardsRoutes)

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' })
    console.log('🚀 Server is running on http://localhost:3000')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()