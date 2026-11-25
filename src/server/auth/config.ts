import { betterAuth, APIError } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db as defaultDb } from "../db";
import * as schema from "../db/schema";
import { env } from "@/lib/env";

function buildTrustedOrigins(): string[] {
  const candidates = [
    env.BETTER_AUTH_URL,
    env.NEXT_PUBLIC_CANONICAL_URL,
    env.NEXT_PUBLIC_PORTFOLIO_URL,
    "https://links.cristianarando.dev",
    "https://inside-link.vercel.app",
    "http://localhost:3000",
  ];

  return Array.from(
    new Set(
      candidates
        .map((origin) => origin.trim().replace(/\/+$/, ""))
        .filter((origin) => origin.length > 0)
    )
  );
}

export function createAuthInstance(database: typeof defaultDb = defaultDb) {
  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: buildTrustedOrigins(),
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
    },
    databaseHooks: {
      account: {
        create: {
          before: async (account) => {
            if (account.providerId === "github") {
              const allowedGithubId = process.env.ALLOWED_GITHUB_ID || env.ALLOWED_GITHUB_ID;
              if (account.accountId !== allowedGithubId) {
                throw new APIError("FORBIDDEN", {
                  message: "Access restricted exclusively to the domain owner.",
                });
              }
            }
          },
        },
      },
      user: {
        create: {
          before: async (user) => {
            const allowedEmail = process.env.ALLOWED_GITHUB_EMAIL || env.ALLOWED_GITHUB_EMAIL;
            if (allowedEmail && user.email.toLowerCase() !== allowedEmail.toLowerCase()) {
              throw new APIError("FORBIDDEN", {
                message: "Access restricted: email does not match owner.",
              });
            }
          },
        },
      },
    },
  });
}

export const auth = createAuthInstance();
