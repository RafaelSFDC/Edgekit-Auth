import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { eq, and, sql } from "drizzle-orm";
import {
  twoFactor,
  organization,
  admin,
  magicLink,
  openAPI,
  jwt,
  bearer,
  emailOTP,
  createAccessControl,
  username,
  phoneNumber,
  anonymous,
  deviceAuthorization,
  haveIBeenPwned,
  multiSession,
  lastLoginMethod,
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
  sendEmailOTPEmail,
} from "@/lib/email";
import { sendSMSOTP } from "@/lib/sms";
import { dispatchWebhook } from "@/lib/webhooks";
import { logAuditEvent } from "@/lib/audit";
import { getFeatureFlags } from "@/lib/features";
import { resolveUserAuthorizationContext, isUserSuperAdmin } from "@/lib/access-control";

const orgStatements = {
  organization: ["update", "delete", "transfer_ownership"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  billing: ["read", "update"],
} as const;

const ac = createAccessControl(orgStatements);

const defaultOrgRoles = {
  owner: ac.newRole({
    organization: ["update", "delete", "transfer_ownership"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    billing: ["read", "update"],
  }),
  admin: ac.newRole({
    organization: ["update"],
    member: ["create", "update"],
    invitation: ["create", "cancel"],
    billing: ["read"],
  }),
  member: ac.newRole({
    organization: [],
    member: [],
    invitation: [],
    billing: [],
  }),
};

const adminAc = createAccessControl({
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "impersonate",
    "impersonate-admins",
    "delete",
    "set-password",
    "set-email",
    "get",
    "update",
  ],
  session: ["list", "revoke", "delete"],
});

const defaultAdminPluginRoles = {
  super_admin: adminAc.newRole({
    user: [
      "create",
      "list",
      "set-role",
      "ban",
      "impersonate",
      "impersonate-admins",
      "delete",
      "set-password",
      "set-email",
      "get",
      "update",
    ],
    session: ["list", "revoke", "delete"],
  }),
  admin: adminAc.newRole({
    user: [
      "create",
      "list",
      "set-role",
      "ban",
      "impersonate",
      "delete",
      "set-password",
      "set-email",
      "get",
      "update",
    ],
    session: ["list", "revoke", "delete"],
  }),
  user: adminAc.newRole({
    user: [],
    session: [],
  }),
};

export function createAuth(env: Bindings, _request?: Request) {
  const features = getFeatureFlags(env);
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

  // Build plugins dynamically based on Feature Flags & configuration
  const plugins: any[] = [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
    }),
    phoneNumber({
      sendOTP: async ({ phoneNumber, code }) => {
        await sendSMSOTP({
          phoneNumber,
          code,
          env,
        });
      },
    }),
    anonymous({
      emailDomainName: "guest.edgekit.internal",
    }),
    multiSession(),
    haveIBeenPwned({
      enabled: env.ENVIRONMENT !== "test" && process.env.NODE_ENV !== "test",
    }),
    lastLoginMethod(),
    deviceAuthorization(),
    admin({
      ac: adminAc,
      roles: defaultAdminPluginRoles,
      adminRoles: ["super_admin"],
      defaultRole: "user",
    }),
  ];

  if (features.mfa) {
    plugins.push(
      twoFactor({
        issuer: "Edgekit Auth",
      })
    );
  }

  if (features.passkeys) {
    plugins.push(passkey());
  }

  if (features.organizations) {
    plugins.push(
      organization({
        ac,
        roles: defaultOrgRoles,
        dynamicAccessControl: {
          enabled: true,
        },
        sendInvitationEmail: async (data) => {
          const clientBase = env.APP_URL || baseURL;
          const inviteUrl = `${clientBase}/accept-invitation?id=${data.id}`;
          await sendOrganizationInviteEmail({
            email: data.email,
            organizationName: data.organization.name,
            inviterEmail: (data as any).inviter?.email,
            role: data.role,
            inviteUrl,
            env,
          });
        },
      })
    );
  }

  if (features.emailOTP) {
    plugins.push(
      emailOTP({
        sendVerificationOTP: async ({ email, otp, type }) => {
          await sendEmailOTPEmail({
            email,
            otp,
            type,
            env,
          });
        },
      })
    );
  }

  if (features.magicLink) {
    plugins.push(
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await sendMagicLinkEmail({
            email,
            url,
            env,
          });
        },
      })
    );
  }

  plugins.push(
    jwt({
      jwt: {
        definePayload: async (session) => {
          const userId = session.user.id;
          const activeOrgId = features.organizations
            ? ((session.session as any).activeOrganizationId || null)
            : null;

          const authCtx = await resolveUserAuthorizationContext(db, env, {
            userId,
            activeOrganizationId: activeOrgId,
            userRecord: session.user,
          });

          let publicMetadata = {};
          try {
            if ((session.user as any).publicMetadata) {
              publicMetadata =
                typeof (session.user as any).publicMetadata === "string"
                  ? JSON.parse((session.user as any).publicMetadata)
                  : (session.user as any).publicMetadata;
            }
          } catch {}

          return {
            sub: session.user.id,
            email: session.user.email,
            name: session.user.name,
            username: (session.user as any).username || null,
            locale: (session.user as any).locale || "en",
            timezone: (session.user as any).timezone || "UTC",
            isSuperAdmin: authCtx.isSuperAdmin,
            publicMetadata,
            org_id: authCtx.activeOrganization?.id || null,
            org_slug: authCtx.activeOrganization?.slug || null,
            org_role: authCtx.activeOrganization?.role || null,
            org_permissions: authCtx.activeOrganization?.permissions || [],
            roles: authCtx.roles,
            permissions: authCtx.permissions,
            plan: authCtx.plan,
            entitlements: authCtx.entitlements,
            limits: authCtx.limits,
          };
        },
      },
    }),
    bearer(),
    openAPI()
  );

  return betterAuth({
    baseURL,
    secret,
    trustedOrigins,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    user: {
      additionalFields: {
        publicMetadata: {
          type: "string",
          required: false,
          defaultValue: "{}",
          input: false,
          returned: true,
        },
        privateMetadata: {
          type: "string",
          required: false,
          defaultValue: "{}",
          input: false,
          returned: false,
        },
        unsafeMetadata: {
          type: "string",
          required: false,
          defaultValue: "{}",
          input: true,
          returned: true,
        },
        isSuperAdmin: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
          returned: true,
        },
        firstName: {
          type: "string",
          required: false,
          input: true,
          returned: true,
        },
        lastName: {
          type: "string",
          required: false,
          input: true,
          returned: true,
        },
        locale: {
          type: "string",
          required: false,
          defaultValue: "en",
          input: true,
          returned: true,
        },
        timezone: {
          type: "string",
          required: false,
          defaultValue: "UTC",
          input: true,
          returned: true,
        },
        theme: {
          type: "string",
          required: false,
          defaultValue: "system",
          input: true,
          returned: true,
        },
        preferences: {
          type: "string",
          required: false,
          defaultValue: "{}",
          input: true,
          returned: true,
        },
        lastActiveAt: {
          type: "date",
          required: false,
          input: false,
          returned: true,
        },
      },
    },
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

            const isSuper = adminEmails.includes(user.email.toLowerCase());
            return {
              data: {
                ...user,
                role: isSuper ? "super_admin" : (user.role || "user"),
                isSuperAdmin: isSuper,
              },
            };
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
    plugins,
  });
}

export type Auth = ReturnType<typeof createAuth>;
