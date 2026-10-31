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
                role: isSuper ? "admin" : "user",
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
    plugins: [
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
      twoFactor({
        issuer: "Edgekit Auth",
      }),
      passkey(),
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
      }),
      emailOTP({
        sendVerificationOTP: async ({ email, otp, type }) => {
          await sendEmailOTPEmail({
            email,
            otp,
            type,
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
      jwt({
        jwt: {
          definePayload: async (session) => {
            const userId = session.user.id;
            const orgId = features.organizations ? ((session.session as any).activeOrganizationId || null) : null;
            let orgRole: string | null = null;
            let orgSlug: string | null = null;
            let orgPermissions: string[] = [];
            let activePlan = "free";
            let activeEntitlements: string[] = [];
            let activeLimits: Record<string, any> = {};

            // 1. Organization context & dynamic permissions
            if (features.organizations && orgId) {
              try {
                const [mem] = await db
                  .select()
                  .from(schema.member)
                  .where(
                    and(
                      eq(schema.member.organizationId, orgId),
                      eq(schema.member.userId, userId)
                    )
                  )
                  .limit(1);

                if (mem) {
                  orgRole = mem.role;
                  const [org] = await db
                    .select()
                    .from(schema.organization)
                    .where(eq(schema.organization.id, orgId))
                    .limit(1);
                  if (org) orgSlug = org.slug;

                  const [customRole] = await db
                    .select()
                    .from(schema.organizationRole)
                    .where(
                      and(
                        eq(schema.organizationRole.organizationId, orgId),
                        eq(schema.organizationRole.role, mem.role)
                      )
                    )
                    .limit(1);

                  if (customRole && customRole.permission) {
                    try {
                      const parsed = JSON.parse(customRole.permission);
                      orgPermissions = Array.isArray(parsed)
                        ? parsed
                        : (Object.values(parsed).flat() as string[]);
                    } catch {}
                  } else {
                    if (mem.role === "owner") {
                      orgPermissions = [
                        "org:delete",
                        "org:update",
                        "org:transfer_ownership",
                        "org:members:invite",
                        "org:members:manage",
                        "org:billing:manage",
                      ];
                    } else if (mem.role === "admin") {
                      orgPermissions = [
                        "org:update",
                        "org:members:invite",
                        "org:members:manage",
                        "org:billing:read",
                      ];
                    } else {
                      orgPermissions = ["org:view"];
                    }
                  }

                  // Check if organization has direct metadata entitlements
                  if (org && org.metadata) {
                    try {
                      const orgMeta = typeof org.metadata === "string" ? JSON.parse(org.metadata) : org.metadata;
                      if (orgMeta?.plan) activePlan = orgMeta.plan;
                      if (Array.isArray(orgMeta?.entitlements)) activeEntitlements = orgMeta.entitlements;
                      if (orgMeta?.limits && typeof orgMeta.limits === "object") activeLimits = orgMeta.limits;
                    } catch {}
                  }

                  // 2. Billing & Stripe subscription for active organization (if billing is enabled)
                  if (features.billing) {
                    const [sub] = await db
                      .select()
                      .from(schema.billingSubscription)
                      .innerJoin(
                        schema.billingPlan,
                        eq(schema.billingSubscription.planId, schema.billingPlan.id)
                      )
                      .where(
                        and(
                          eq(schema.billingSubscription.targetType, "organization"),
                          eq(schema.billingSubscription.targetId, orgId),
                          eq(schema.billingSubscription.status, "active")
                        )
                      )
                      .limit(1);

                    if (sub) {
                      activePlan = sub.billing_plan.slug;
                      try {
                        activeEntitlements = JSON.parse(sub.billing_plan.features || "[]");
                      } catch {}
                      try {
                        activeLimits = JSON.parse(sub.billing_plan.limits || "{}");
                      } catch {}
                    }
                  }
                }
              } catch {}
            }

            // 3. User-level B2C subscription or direct entitlements if no active org subscription was found
            if (activePlan === "free" && userId) {
              if (features.billing) {
                try {
                  const [userSub] = await db
                    .select()
                    .from(schema.billingSubscription)
                    .innerJoin(
                      schema.billingPlan,
                      eq(schema.billingSubscription.planId, schema.billingPlan.id)
                    )
                    .where(
                      and(
                        eq(schema.billingSubscription.targetType, "user"),
                        eq(schema.billingSubscription.targetId, userId),
                        eq(schema.billingSubscription.status, "active")
                      )
                    )
                    .limit(1);

                  if (userSub) {
                    activePlan = userSub.billing_plan.slug;
                    try {
                      activeEntitlements = JSON.parse(userSub.billing_plan.features || "[]");
                    } catch {}
                    try {
                      activeLimits = JSON.parse(userSub.billing_plan.limits || "{}");
                    } catch {}
                  }
                } catch {}
              }

              // Check direct entitlements on user publicMetadata
              if (activePlan === "free" && (session.user as any).publicMetadata) {
                try {
                  const userMeta = typeof (session.user as any).publicMetadata === "string"
                    ? JSON.parse((session.user as any).publicMetadata)
                    : (session.user as any).publicMetadata;
                  if (userMeta?.plan) activePlan = userMeta.plan;
                  if (Array.isArray(userMeta?.entitlements)) activeEntitlements = userMeta.entitlements;
                  if (userMeta?.limits && typeof userMeta.limits === "object") activeLimits = userMeta.limits;
                } catch {}
              }
            }

            // 4. Global RBAC roles & permissions (if RBAC feature is enabled)
            let globalRoles: string[] = [];
            let globalPermissions: string[] = [];
            if (features.rbac) {
              try {
                const userRolesList = await db
                  .select({
                    roleKey: schema.role.key,
                  })
                  .from(schema.userRole)
                  .innerJoin(schema.role, eq(schema.userRole.roleId, schema.role.id))
                  .where(eq(schema.userRole.userId, userId));

                globalRoles = userRolesList.map((r) => r.roleKey);

                if (globalRoles.length > 0) {
                  const permsList = await db
                    .select({
                      permissionKey: schema.rolePermission.permissionKey,
                    })
                    .from(schema.rolePermission)
                    .innerJoin(
                      schema.role,
                      eq(schema.rolePermission.roleId, schema.role.id)
                    )
                    .where(
                      sql`${schema.role.key} IN (${sql.join(
                        globalRoles.map((r) => sql`${r}`),
                        sql`, `
                      )})`
                    );

                  globalPermissions = Array.from(new Set(permsList.map((p) => p.permissionKey)));
                }
              } catch {}
            }

            let publicMetadata = {};
            try {
              if ((session.user as any).publicMetadata) {
                publicMetadata =
                  typeof (session.user as any).publicMetadata === "string"
                    ? JSON.parse((session.user as any).publicMetadata)
                    : (session.user as any).publicMetadata;
              }
            } catch {}

            const isSuperAdmin = Boolean(
              (session.user as any).isSuperAdmin ||
              (session.user as any).role === "super_admin" ||
              (session.user as any).role === "admin"
            );

            return {
              sub: session.user.id,
              email: session.user.email,
              name: session.user.name,
              username: (session.user as any).username || null,
              locale: (session.user as any).locale || "en",
              timezone: (session.user as any).timezone || "UTC",
              isSuperAdmin,
              publicMetadata,
              org_id: orgId,
              org_slug: orgSlug,
              org_role: orgRole,
              org_permissions: orgPermissions,
              roles: globalRoles,
              permissions: globalPermissions,
              plan: activePlan,
              entitlements: activeEntitlements,
              limits: activeLimits,
            };
          },
        },
      }),
      bearer(),
      openAPI(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
