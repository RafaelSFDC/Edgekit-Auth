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
import {
  sendMagicLinkEmail,
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
  sendOrganizationInviteEmail,
} from "@/lib/email";
import { dispatchWebhook } from "@/lib/webhooks";

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
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 minutes fast cache in secure encrypted cookie
      },
    },
    rateLimit: {
      enabled: env.ENVIRONMENT !== "test" && process.env.NODE_ENV !== "test",
      window: 60,
      max: 100,
      storage: "memory",
    },
    advanced: {
      crossSubDomainCookies: env.COOKIE_DOMAIN
        ? {
            enabled: true,
            domain: env.COOKIE_DOMAIN,
          }
        : undefined,
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const adminEmails = (env.ADMIN_EMAILS || "")
              .split(",")
              .map((e) => e.trim().toLowerCase())
              .filter(Boolean);

            if (adminEmails.includes(user.email.toLowerCase())) {
              return {
                data: {
                  ...user,
                  role: "admin",
                },
              };
            }
          },
          after: async (user) => {
            if (env.WEBHOOK_URL) {
              await dispatchWebhook(env, {
                event: "user.created",
                data: {
                  id: user.id,
                  email: user.email,
                  name: user.name,
                  role: (user as any).role,
                  createdAt: user.createdAt,
                },
              });
            }
          },
        },
        update: {
          after: async (user) => {
            if (env.WEBHOOK_URL) {
              await dispatchWebhook(env, {
                event: "user.updated",
                data: {
                  id: user.id,
                  email: user.email,
                  name: user.name,
                  role: (user as any).role,
                  updatedAt: user.updatedAt,
                },
              });
            }
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            if (env.WEBHOOK_URL) {
              await dispatchWebhook(env, {
                event: "session.created",
                data: {
                  id: session.id,
                  userId: session.userId,
                  expiresAt: session.expiresAt,
                  createdAt: session.createdAt,
                },
              });
            }
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }: { user: { email: string }; url: string; token: string }) => {
        await sendPasswordResetEmail({
          email: user.email,
          url,
          env,
        });
      },
      sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string; token: string }) => {
        await sendEmailVerificationEmail({
          email: user.email,
          url,
          env,
        });
      },
    },
    socialProviders: Object.keys(socialProviders).length > 0 ? (socialProviders as any) : undefined,
    plugins: [
      twoFactor({
        issuer: "Edgekit Auth",
      }),
      passkey(),
      organization({
        sendInvitationEmail: async (data) => {
          const inviteUrl = `${baseURL}/accept-invitation?id=${data.id}`;
          await sendOrganizationInviteEmail({
            email: data.email,
            organizationName: data.organization.name,
            inviterEmail: (data as any).inviter?.email,
            role: data.role,
            inviteUrl,
            env,
          });
        },
      }),
      admin(),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await sendMagicLinkEmail({
            email,
            url,
            env,
          });
        },
      }),
      jwt(),
      bearer(),
      openAPI(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
