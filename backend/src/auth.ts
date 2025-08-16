import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "./db.js";

// Use Prisma adapter with PostgreSQL
export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  plugins: [
    expo({
      scheme: "memocards",
    }),
  ],
  trustedOrigins: [
    "http://localhost:8081",
    "exp://localhost:8081",
    "memocards://",
  ],
  secret: process.env.BETTER_AUTH_SECRET,
  advanced: {
    crossSubDomainCookies: {
      enabled: true,
    },
  },
});

export type Session = typeof auth.$Infer.Session;
