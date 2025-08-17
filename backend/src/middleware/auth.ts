import { FastifyRequest, FastifyReply } from "fastify";
import { auth } from "../auth.js";

export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;
    email: string;
    name?: string;
  };
}

export async function authGuard(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Better Auth expects session token in cookies, but our frontend sends it as Bearer token
    // Let's extract the token from Authorization header and create a cookie-like headers object
    const authorizationHeader = request.headers.authorization;

    if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
      return reply
        .status(401)
        .send({ error: "Missing or invalid authorization header" });
    }

    const token = authorizationHeader.substring(7);

    console.log(`Verifying token: ${token.substring(0, 10)}...`);

    try {
      const { db } = await import("../db.js");

      const sessionRecord = await db.session.findFirst({
        where: {
          token: token,
        },
        include: {
          user: true,
        },
      });

      if (!sessionRecord || !sessionRecord.user) {
        console.log("No session found in database for token");
        return reply.status(401).send({ error: "Invalid or expired token" });
      }

      // Check if session is expired
      if (sessionRecord.expiresAt < new Date()) {
        console.log("Session expired");
        return reply.status(401).send({ error: "Session expired" });
      }

      console.log("Session found in database:", sessionRecord.id);

      // Add user to request object
      (request as AuthenticatedRequest).user = {
        id: sessionRecord.user.id,
        email: sessionRecord.user.email,
        name: sessionRecord.user.name || undefined,
      };

      return; // Success
    } catch (dbError) {
      console.error("Database session lookup failed:", dbError);
      // Fall back to Better Auth API method
    }

    // Fallback: Try with Better Auth API (this might not work with unsigned token)
    const headers = new Headers({
      cookie: `better-auth.session_token=${token}`,
    });

    const session = await auth.api.getSession({
      headers: headers,
    });

    console.log("Session result:", session ? "valid" : "invalid");

    if (!session || !session.user) {
      console.log("Session validation failed:", {
        session,
        hasUser: !!session?.user,
      });
      return reply.status(401).send({ error: "Invalid or expired token" });
    }

    // Add user to request object
    (request as AuthenticatedRequest).user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name || undefined,
    };
  } catch (error) {
    request.log.error("Auth guard error:", error as any);
    return reply.status(401).send({ error: "Authentication failed" });
  }
}
