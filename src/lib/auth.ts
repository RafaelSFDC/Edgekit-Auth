import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import {
  twoFactor,
  organization,
  admin,
  magicLink,
  openAPI,
  jwt,
  bearer,
} from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { createDb } from "@/db";
import * as schema from "@/db/schema";
import type { Bindings } from "@/types/env";

export function createAuth(env: Bindings, request?: Request) {
  const db = createDb(env.DB);
  const baseURL = env.BETTER_AUTH_URL || env.APP_URL || "http://localhost:8787";
  const secret =
    env.BETTER_AUTH_SECRET ||
    env.COOKIE_SECRET ||
    "change-this-better-auth-secret-key-min-32-chars-long";

  // Build social providers dynamically if credentials exist in .env
  const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }

  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    socialProviders.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    };
  }

  if (env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET) {
    socialProviders.discord = {
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
    };
  }

  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
    socialProviders.microsoft = {
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
    };
  }

  return betterAuth({
    baseURL,
    secret,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    socialProviders: Object.keys(socialProviders).length > 0 ? (socialProviders as any) : undefined,
    plugins: [
      twoFactor({
        issuer: "Edgekit Auth",
      }),
      passkey(),
      organization(),
      admin(),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          if (env.RESEND_API_KEY) {
            try {
              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${env.RESEND_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  from: env.FROM_EMAIL || "onboarding@resend.dev",
                  to: email,
                  subject: "Seu link de acesso - Edgekit Auth",
                  html: `<p>Acesse sua conta clicando no link abaixo:</p><p><a href="${url}">${url}</a></p>`,
                }),
              });
            } catch (err) {
              console.error("[Email] Erro ao enviar Magic Link:", err);
            }
          } else {
            console.log(
              `\n========================================\n[MAGIC LINK DEV CONSOLE]\nPara: ${email}\nLink: ${url}\n========================================\n`
            );
          }
        },
      }),
      jwt(),
      bearer(),
      openAPI(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
