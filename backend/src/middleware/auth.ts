import { FastifyRequest, FastifyReply } from 'fastify'
import { auth } from '../auth.js'

export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string
    email: string
    name?: string
  }
}

export async function authGuard(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authorizationHeader = request.headers.authorization
    
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid authorization header' })
    }

    const token = authorizationHeader.substring(7)
    
    // Verify the session with Better Auth
    const session = await auth.api.getSession({
      headers: {
        authorization: `Bearer ${token}`,
      },
    })

    if (!session || !session.user) {
      return reply.status(401).send({ error: 'Invalid or expired token' })
    }

    // Add user to request object
    ;(request as AuthenticatedRequest).user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name || undefined,
    }
  } catch (error) {
    request.log.error('Auth guard error:', error)
    return reply.status(401).send({ error: 'Authentication failed' })
  }
}