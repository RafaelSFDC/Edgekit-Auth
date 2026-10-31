import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "@/types/env";
import * as schema from "@/db/schema";
import { eq, and, gt, sql, ne } from "drizzle-orm";
import { verifyApiKey } from "@/lib/api-keys";
import { logAuditEvent } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";

export const userRoutes = new Hono<AppContext>();

interface AuthIdentity {
  userId: string;
  isM2M: boolean;
  currentSessionId?: string;
}

/**
 * Helper to authenticate either:
 * 1. Consumer user via Better Auth Session (Cookie or Authorization: Bearer <sessionToken>)
 * 2. Backend M2M via Secret Key (Authorization: Bearer sk_... / x-api-key) with optional target user (x-user-id)
 */
async function getAuthIdentity(c: any): Promise<AuthIdentity | null> {
  const auth = c.get("auth");
  const db = c.get("db");

  // Check M2M Secret Key first
  const authHeader = c.req.header("authorization") || "";
  const xApiKey = c.req.header("x-api-key") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : xApiKey.trim();

  if (token && (token.startsWith("sk_") || token.startsWith("ek_"))) {
    const apiKeyRecord = await verifyApiKey(db, token);
    if (apiKeyRecord) {
      const targetUserId = c.req.header("x-user-id") || apiKeyRecord.createdById || "system";
      return {
        userId: targetUserId,
        isM2M: true,
      };
    }
  }

  // Check Better Auth Session
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session && session.user) {
    return {
      userId: session.user.id,
      isM2M: false,
      currentSessionId: session.session.id,
    };
  }

  return null;
}

/**
 * Safely parse JSON string into object, fallback to default
 */
function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === "object") return value as T;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * GET /me (or /api/v1/users/me)
 * Retrieves authenticated consumer user's profile, preferences, metadata, and roles.
 */
userRoutes.get("/me", async (c) => {
  const identity = await getAuthIdentity(c);
  if (!identity) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Autenticação necessária. Forneça cookie de sessão, Bearer token ou Secret Key.",
      },
      401
    );
  }

  const db = c.get("db");
  const [targetUser] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, identity.userId))
    .limit(1);

  if (!targetUser) {
    return c.json(
      {
        error: "NotFound",
        message: "Usuário não encontrado.",
      },
      404
    );
  }

  // 1. Organization context (if any)
  let activeOrg: any = null;
  const memberships = await db
    .select({
      member: schema.member,
      org: schema.organization,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
    .where(eq(schema.member.userId, targetUser.id));

  if (memberships.length > 0) {
    const firstMembership = memberships[0];
    let permissions: string[] = [];

    const [customRole] = await db
      .select()
      .from(schema.organizationRole)
      .where(
        and(
          eq(schema.organizationRole.organizationId, firstMembership.org.id),
          eq(schema.organizationRole.role, firstMembership.member.role)
        )
      )
      .limit(1);

    if (customRole && customRole.permission) {
      try {
        const parsed = JSON.parse(customRole.permission);
        permissions = Array.isArray(parsed) ? parsed : (Object.values(parsed).flat() as string[]);
      } catch {}
    } else {
      if (firstMembership.member.role === "owner") {
        permissions = [
          "org:delete",
          "org:update",
          "org:transfer_ownership",
          "org:members:invite",
          "org:members:manage",
          "org:billing:manage",
        ];
      } else if (firstMembership.member.role === "admin") {
        permissions = [
          "org:update",
          "org:members:invite",
          "org:members:manage",
          "org:billing:read",
        ];
      } else {
        permissions = ["org:view"];
      }
    }

    activeOrg = {
      id: firstMembership.org.id,
      name: firstMembership.org.name,
      slug: firstMembership.org.slug,
      role: firstMembership.member.role,
      permissions,
    };
  }

  // 2. Global RBAC roles & permissions
  const userRolesList = await db
    .select({
      roleKey: schema.role.key,
      roleId: schema.role.id,
    })
    .from(schema.userRole)
    .innerJoin(schema.role, eq(schema.userRole.roleId, schema.role.id))
    .where(eq(schema.userRole.userId, targetUser.id));

  const roles = userRolesList.map((r) => r.roleKey);
  let permissions: string[] = [];
  if (roles.length > 0) {
    const perms = await db
      .select({
        permissionKey: schema.rolePermission.permissionKey,
      })
      .from(schema.rolePermission)
      .innerJoin(schema.role, eq(schema.rolePermission.roleId, schema.role.id))
      .where(
        sql`${schema.role.key} IN (${sql.join(
          roles.map((r) => sql`${r}`),
          sql`, `
        )})`
      );
    permissions = Array.from(new Set(perms.map((p) => p.permissionKey)));
  }

  // 3. Billing Plan & Entitlements
  let plan = "free";
  let entitlements: string[] = [];
  const [sub] = await db
    .select()
    .from(schema.billingSubscription)
    .innerJoin(schema.billingPlan, eq(schema.billingSubscription.planId, schema.billingPlan.id))
    .where(
      and(
        eq(schema.billingSubscription.targetType, "user"),
        eq(schema.billingSubscription.targetId, targetUser.id),
        eq(schema.billingSubscription.status, "active")
      )
    )
    .limit(1);

  if (sub) {
    plan = sub.billing_plan.slug;
    entitlements = safeJsonParse<string[]>(sub.billing_plan.features, []);
  }

  // Parse Metadata & Preferences
  const publicMetadata = safeJsonParse(targetUser.publicMetadata, {});
  const unsafeMetadata = safeJsonParse(targetUser.unsafeMetadata, {});
  const preferences = safeJsonParse(targetUser.preferences, {});

  // Build clean User response (following Clerk / Supabase standards)
  const userResponse: Record<string, any> = {
    id: targetUser.id,
    name: targetUser.name,
    firstName: targetUser.firstName || null,
    lastName: targetUser.lastName || null,
    email: targetUser.email,
    emailVerified: Boolean(targetUser.emailVerified),
    username: targetUser.username || null,
    displayUsername: targetUser.displayUsername || null,
    phoneNumber: targetUser.phoneNumber || null,
    phoneNumberVerified: Boolean(targetUser.phoneNumberVerified),
    image: targetUser.image || null,
    isAnonymous: Boolean(targetUser.isAnonymous),
    locale: targetUser.locale || "en",
    timezone: targetUser.timezone || "UTC",
    theme: targetUser.theme || "system",
    preferences,
    publicMetadata,
    unsafeMetadata,
    twoFactorEnabled: Boolean(targetUser.twoFactorEnabled),
    createdAt: targetUser.createdAt,
    updatedAt: targetUser.updatedAt,
    lastActiveAt: targetUser.lastActiveAt || null,
    organization: activeOrg,
    roles,
    permissions,
    plan,
    entitlements,
  };

  // If caller is backend M2M with Secret Key, include privateMetadata
  if (identity.isM2M) {
    userResponse.privateMetadata = safeJsonParse(targetUser.privateMetadata, {});
    userResponse.role = targetUser.role;
    userResponse.isSuperAdmin = Boolean(targetUser.isSuperAdmin);
  }

  return c.json({ user: userResponse });
});

const patchMeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  firstName: z.string().max(50).nullable().optional(),
  lastName: z.string().max(50).nullable().optional(),
  image: z.string().max(500).nullable().optional(),
  locale: z.string().max(20).optional(),
  timezone: z.string().max(50).optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
  preferences: z.record(z.unknown()).optional(),
  unsafeMetadata: z.record(z.unknown()).optional(),
  // Only server M2M can modify publicMetadata and privateMetadata
  publicMetadata: z.record(z.unknown()).optional(),
  privateMetadata: z.record(z.unknown()).optional(),
});

/**
 * PATCH /me (or /api/v1/users/me)
 * Consumer user updates their own profile, preferences, and unsafeMetadata.
 */
userRoutes.patch("/me", async (c) => {
  const identity = await getAuthIdentity(c);
  if (!identity) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Autenticação necessária.",
      },
      401
    );
  }

  const db = c.get("db");
  const env = c.env;

  const [existingUser] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, identity.userId))
    .limit(1);

  if (!existingUser) {
    return c.json({ error: "NotFound", message: "Usuário não encontrado." }, 404);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "BadRequest", message: "JSON inválido" }, 400);
  }

  const parsed = patchMeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "ValidationError",
        message: "Dados inválidos",
        issues: parsed.error.issues,
      },
      400
    );
  }

  const data = parsed.data;

  // Protect publicMetadata and privateMetadata from consumer client modification
  if (!identity.isM2M) {
    if (data.publicMetadata !== undefined || data.privateMetadata !== undefined) {
      return c.json(
        {
          error: "Forbidden",
          message:
            "publicMetadata e privateMetadata só podem ser alterados pelo backend via Secret Key (sk_...). Use unsafeMetadata ou preferences para o frontend.",
        },
        403
      );
    }
  }

  const updateFields: Record<string, any> = {
    updatedAt: new Date(),
    lastActiveAt: new Date(),
  };

  if (data.name !== undefined) updateFields.name = data.name;
  if (data.firstName !== undefined) updateFields.firstName = data.firstName;
  if (data.lastName !== undefined) updateFields.lastName = data.lastName;
  if (data.image !== undefined) updateFields.image = data.image;
  if (data.locale !== undefined) updateFields.locale = data.locale;
  if (data.timezone !== undefined) updateFields.timezone = data.timezone;
  if (data.theme !== undefined) updateFields.theme = data.theme;

  if (data.preferences !== undefined) {
    const existing = safeJsonParse<Record<string, unknown>>(existingUser.preferences, {});
    updateFields.preferences = JSON.stringify({ ...existing, ...data.preferences });
  }

  if (data.unsafeMetadata !== undefined) {
    const existing = safeJsonParse<Record<string, unknown>>(existingUser.unsafeMetadata, {});
    updateFields.unsafeMetadata = JSON.stringify({ ...existing, ...data.unsafeMetadata });
  }

  if (identity.isM2M) {
    if (data.publicMetadata !== undefined) {
      const existing = safeJsonParse<Record<string, unknown>>(existingUser.publicMetadata, {});
      updateFields.publicMetadata = JSON.stringify({ ...existing, ...data.publicMetadata });
    }
    if (data.privateMetadata !== undefined) {
      const existing = safeJsonParse<Record<string, unknown>>(existingUser.privateMetadata, {});
      updateFields.privateMetadata = JSON.stringify({ ...existing, ...data.privateMetadata });
    }
  }

  const [updatedUser] = await db
    .update(schema.user)
    .set(updateFields)
    .where(eq(schema.user.id, existingUser.id))
    .returning();

  await logAuditEvent(db, {
    action: "user.profile_updated",
    actorId: existingUser.id,
    actorEmail: existingUser.email,
    targetId: existingUser.id,
    targetType: "user",
    metadata: {
      updatedFields: Object.keys(updateFields).filter((k) => k !== "updatedAt" && k !== "lastActiveAt"),
    },
  });

  if (env.WEBHOOK_URL) {
    await dispatchWebhook(env, {
      event: "user.updated",
      data: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        locale: updatedUser.locale,
        timezone: updatedUser.timezone,
        updatedAt: updatedUser.updatedAt,
      },
    });
  }

  return c.json({
    success: true,
    message: "Perfil e preferências atualizados com sucesso",
    user: {
      id: updatedUser.id,
      name: updatedUser.name,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      image: updatedUser.image,
      locale: updatedUser.locale,
      timezone: updatedUser.timezone,
      theme: updatedUser.theme,
      preferences: safeJsonParse(updatedUser.preferences, {}),
      publicMetadata: safeJsonParse(updatedUser.publicMetadata, {}),
      unsafeMetadata: safeJsonParse(updatedUser.unsafeMetadata, {}),
      updatedAt: updatedUser.updatedAt,
    },
  });
});

/**
 * GET /me/sessions
 * List active sessions for the current consumer user.
 */
userRoutes.get("/me/sessions", async (c) => {
  const identity = await getAuthIdentity(c);
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  const db = c.get("db");
  const sessions = await db
    .select({
      id: schema.session.id,
      ipAddress: schema.session.ipAddress,
      userAgent: schema.session.userAgent,
      createdAt: schema.session.createdAt,
      expiresAt: schema.session.expiresAt,
    })
    .from(schema.session)
    .where(
      and(
        eq(schema.session.userId, identity.userId),
        gt(schema.session.expiresAt, new Date())
      )
    );

  const formatted = sessions.map((s) => ({
    ...s,
    isCurrent: identity.currentSessionId ? s.id === identity.currentSessionId : false,
  }));

  return c.json({ sessions: formatted });
});

/**
 * DELETE /me/sessions/:id
 * Revoke a specific active session.
 */
userRoutes.delete("/me/sessions/:id", async (c) => {
  const identity = await getAuthIdentity(c);
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  const db = c.get("db");
  const sessionId = c.req.param("id");

  const [revoked] = await db
    .delete(schema.session)
    .where(
      and(
        eq(schema.session.id, sessionId),
        eq(schema.session.userId, identity.userId)
      )
    )
    .returning();

  if (!revoked) {
    return c.json({ error: "NotFound", message: "Sessão não encontrada ou não pertence ao usuário." }, 404);
  }

  return c.json({ success: true, message: "Sessão revogada com sucesso." });
});

/**
 * DELETE /me/sessions
 * Revoke all other sessions for the user (except current active session).
 */
userRoutes.delete("/me/sessions", async (c) => {
  const identity = await getAuthIdentity(c);
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  const db = c.get("db");

  if (identity.currentSessionId) {
    await db
      .delete(schema.session)
      .where(
        and(
          eq(schema.session.userId, identity.userId),
          ne(schema.session.id, identity.currentSessionId)
        )
      );
  } else {
    await db
      .delete(schema.session)
      .where(eq(schema.session.userId, identity.userId));
  }

  return c.json({ success: true, message: "Demais sessões revogadas com sucesso." });
});
