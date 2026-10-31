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
import { logAuditEvent } from "@/lib/audit";

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

  if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET) {
    socialProviders.apple = {
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: env.APPLE_CLIENT_SECRET,
    };
  }

  if (env.GITLAB_CLIENT_ID && env.GITLAB_CLIENT_SECRET) {
    socialProviders.gitlab = {
      clientId: env.GITLAB_CLIENT_ID,
      clientSecret: env.GITLAB_CLIENT_SECRET,
    };
  }

  // Build trusted origins list (for CSRF protection and origin validation)
  const envAllowedOrigins = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const trustedOrigins = Array.from(
    new Set([
      baseURL,
      ...(env.APP_URL ? [env.APP_URL] : []),
      "http://localhost:5173",
      "http://localhost:8787",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:8787",
      "http://localhost:3000",
      "http://localhost:4173",
      "http://localhost:*",
      "http://127.0.0.1:*",
      ...envAllowedOrigins,
    ])
  );

  return betterAuth({
    baseURL,
    secret,
    trustedOrigins,
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
      enabled:
        env.RATE_LIMIT_ENABLED === "true"
          ? true
          : env.RATE_LIMIT_ENABLED === "false"
          ? false
          : env.ENVIRONMENT !== "test" && process.env.NODE_ENV !== "test",
      window: env.RATE_LIMIT_WINDOW ? Number(env.RATE_LIMIT_WINDOW) : 60,
      max: env.RATE_LIMIT_MAX ? Number(env.RATE_LIMIT_MAX) : 100,
      storage: "memory",
      customRules: env.RATE_LIMIT_MAX
        ? {
            "/sign-in/*": {
              window: env.RATE_LIMIT_WINDOW ? Number(env.RATE_LIMIT_WINDOW) : 10,
              max: Number(env.RATE_LIMIT_MAX),
            },
            "/sign-up/*": {
              window: env.RATE_LIMIT_WINDOW ? Number(env.RATE_LIMIT_WINDOW) : 10,
              max: Number(env.RATE_LIMIT_MAX),
            },
          }
        : undefined,
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
            await logAuditEvent(db, {
              action: "user.created",
              actorId: user.id,
              actorEmail: user.email,
              targetId: user.id,
              targetType: "user",
              metadata: { role: (user as any).role },
            });
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
            await logAuditEvent(db, {
              action: "user.updated",
              actorId: user.id,
              actorEmail: user.email,
              targetId: user.id,
              targetType: "user",
              metadata: { role: (user as any).role },
            });
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
            await logAuditEvent(db, {
              action: "session.created",
              actorId: session.userId,
              targetId: session.id,
              targetType: "session",
              ipAddress: session.ipAddress,
              userAgent: session.userAgent,
            });
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
      organization: {
        create: {
          after: async (org: any) => {
            await logAuditEvent(db, {
              action: "organization.created",
              targetId: org.id,
              targetType: "organization",
              metadata: { name: org.name, slug: org.slug },
            });
            if (env.WEBHOOK_URL) {
              await dispatchWebhook(env, {
                event: "organization.created",
                data: {
                  id: org.id,
                  name: org.name,
                  slug: org.slug,
                  createdAt: org.createdAt,
                },
              });
            }
          },
        },
      },
      member: {
        create: {
          after: async (m: any) => {
            await logAuditEvent(db, {
              action: "member.created",
              actorId: m.userId,
              targetId: m.id,
              targetType: "organization",
              metadata: { organizationId: m.organizationId, role: m.role },
            });
            if (env.WEBHOOK_URL) {
              await dispatchWebhook(env, {
                event: "member.created",
                data: {
                  id: m.id,
                  organizationId: m.organizationId,
                  userId: m.userId,
                  role: m.role,
                  createdAt: m.createdAt,
                },
              });
            }
          },
        },
      },
      invitation: {
        create: {
          after: async (inv: any) => {
            await logAuditEvent(db, {
              action: "invitation.created",
              targetId: inv.id,
              targetType: "organization",
              metadata: { organizationId: inv.organizationId, email: inv.email, role: inv.role },
            });
            if (env.WEBHOOK_URL) {
              await dispatchWebhook(env, {
                event: "invitation.created",
                data: {
                  id: inv.id,
                  organizationId: inv.organizationId,
                  email: inv.email,
                  role: inv.role,
                  status: inv.status,
                  createdAt: inv.createdAt,
                },
              });
            }
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION === "true",
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
