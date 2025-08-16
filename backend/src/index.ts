import Fastify from "fastify";
import cors from "@fastify/cors";
import { auth } from "./auth.js";
import { authGuard, AuthenticatedRequest } from "./middleware/auth.js";
import { flashcardsRoutes } from "./routes/flashcards.js";

const fastify = Fastify({
  logger: true,
});

await fastify.register(cors, {
  origin: ["http://localhost:8081", "exp://localhost:8081"],
  credentials: true,
});

// Better Auth routes
fastify.get("/api/auth/use-session", async (request, reply) => {
  console.log("Custom use-session handler called");

  // Forward to get-session internally
  const url = new URL(
    "/api/auth/get-session",
    `http://${request.headers.host}`
  );

  const headers = new Headers();
  Object.entries(request.headers).forEach(([key, value]) => {
    if (value) headers.append(key, value.toString());
  });

  const req = new Request(url.toString(), {
    method: "GET",
    headers,
  });

  try {
    const response = await auth.handler(req);

    if (response) {
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      reply.send(response.body ? await response.text() : null);
    } else {
      reply.status(404).send({ error: "Session not found" });
    }
  } catch (error) {
    console.error("use-session handler error:", error);
    reply.status(500).send({ error: "Internal server error" });
  }
});

fastify.route({
  method: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  url: "/api/auth/*",
  async handler(request, reply) {
    try {
      console.log(`Auth route called: ${request.method} ${request.url}`);

      const url = new URL(request.url, `http://${request.headers.host}`);

      const headers = new Headers();
      Object.entries(request.headers).forEach(([key, value]) => {
        if (value) headers.append(key, value.toString());
      });

      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
      });

      const response = await auth.handler(req);

      if (!response) {
        console.log(
          `No response from auth.handler for ${request.method} ${request.url}`
        );
        return reply.status(404).send({ error: "Auth route not found" });
      }

      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      reply.send(response.body ? await response.text() : null);
    } catch (error) {
      fastify.log.error("Better Auth handler error:", error as any);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      reply.status(500).send({
        error: "Internal authentication error",
        code: "AUTH_FAILURE",
      });
    }
  },
});

fastify.get("/", async () => {
  return { message: "Flashcards API is running!" };
});

fastify.get("/health", async () => {
  return { status: "healthy", timestamp: new Date().toISOString() };
});

// Debug: List available auth endpoints
fastify.get("/auth-debug", async () => {
  console.log("Checking actual auth handler routes...");

  // Test what routes are actually handled by Better Auth
  const testRoutes = [
    "/api/auth/session",
    "/api/auth/get-session",
    "/api/auth/use-session",
    "/api/auth/sign-in/email",
    "/api/auth/sign-up/email",
    "/api/auth/sign-out",
  ];

  return {
    availableEndpoints: testRoutes,
    authConfigured: !!auth,
    note: "use-session might be client-side only",
  };
});

// Protected test route
fastify.get("/api/me", { preHandler: [authGuard] }, async (request) => {
  const authRequest = request as AuthenticatedRequest;
  return {
    user: authRequest.user,
    message: "You are authenticated!",
  };
});

// Register flashcards routes
await fastify.register(flashcardsRoutes);

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: "0.0.0.0" });
    console.log("🚀 Server is running on http://localhost:3000");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
