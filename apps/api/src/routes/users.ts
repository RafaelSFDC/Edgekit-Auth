import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "@/types/env";
import * as schema from "@/db/schema";
import { eq, and, gt, sql, ne, or, desc } from "drizzle-orm";
import { verifyApiKey } from "@/lib/api-keys";
import { logAuditEvent } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";
import { resolveUserAuthorizationContext, isUserSuperAdmin } from "@/lib/access-control";

export const userRoutes = new Hono<AppContext>();

interface AuthIdentity {
  userId: string;
  isM2M: boolean;
  currentSessionId?: string;
  activeOrganizationId?: string | null;
  isSuperAdmin?: boolean;
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
    if (apiKeyRecord && apiKeyRecord.keyType === "secret") {
      const targetUserId = c.req.header("x-user-id") || apiKeyRecord.createdById || "system";
      return {
        userId: targetUserId,
        isM2M: true,
        isSuperAdmin: apiKeyRecord.role === "admin",
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
      activeOrganizationId: (session.session as any).activeOrganizationId || null,
      isSuperAdmin: isUserSuperAdmin(session.user),
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

  const authCtx = await resolveUserAuthorizationContext(db, c.env, {
    userId: targetUser.id,
    activeOrganizationId:
      identity.activeOrganizationId ||
      c.req.header("x-organization-id") ||
      c.req.query("organization_id") ||
      null,
    userRecord: targetUser,
  });

  const publicMetadata = safeJsonParse(targetUser.publicMetadata, {});
  const unsafeMetadata = safeJsonParse(targetUser.unsafeMetadata, {});
  const preferences = safeJsonParse(targetUser.preferences, {});

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
    organization: authCtx.activeOrganization,
    roles: authCtx.roles,
    permissions: authCtx.permissions,
    plan: authCtx.plan,
    subscriptionStatus: authCtx.subscriptionStatus,
    entitlements: authCtx.entitlements,
    limits: authCtx.limits,
    isSuperAdmin: authCtx.isSuperAdmin,
  };

  if (identity.isM2M) {
    userResponse.privateMetadata = safeJsonParse(targetUser.privateMetadata, {});
    userResponse.role = targetUser.role;
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

/**
 * GET /me/organizations
 * List all organizations the authenticated consumer belongs to.
 */
userRoutes.get("/me/organizations", async (c) => {
  const identity = await getAuthIdentity(c);
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  const db = c.get("db");
  const memberships = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
      logo: schema.organization.logo,
      role: schema.member.role,
      joinedAt: schema.member.createdAt,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
    .where(eq(schema.member.userId, identity.userId))
    .orderBy(schema.member.createdAt);

  return c.json({ organizations: memberships });
});

/**
 * POST /me/active-organization
 * Set or clear the active organization on the current session.
 */
userRoutes.post("/me/active-organization", async (c) => {
  const identity = await getAuthIdentity(c);
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  if (!identity.currentSessionId) {
    return c.json(
      {
        error: "BadRequest",
        message: "Sessão interativa necessária para alterar a organização ativa.",
      },
      400
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const organizationId = body.organizationId !== undefined ? body.organizationId : null;

  const db = c.get("db");

  if (organizationId) {
    const [membership] = await db
      .select()
      .from(schema.member)
      .where(
        and(
          eq(schema.member.organizationId, organizationId),
          eq(schema.member.userId, identity.userId)
        )
      )
      .limit(1);

    if (!membership) {
      return c.json({ error: "Forbidden", message: "Você não é membro desta organização." }, 403);
    }
  }

  await db
    .update(schema.session)
    .set({
      activeOrganizationId: organizationId,
      updatedAt: new Date(),
    })
    .where(eq(schema.session.id, identity.currentSessionId));

  return c.json({
    success: true,
    activeOrganizationId: organizationId,
  });
});

/**
 * GET /me/invitations
 * List pending organization invitations for the authenticated consumer's email.
 */
userRoutes.get("/me/invitations", async (c) => {
  const identity = await getAuthIdentity(c);
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  const db = c.get("db");
  const [targetUser] = await db
    .select({ email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.id, identity.userId))
    .limit(1);

  if (!targetUser) {
    return c.json({ error: "NotFound", message: "Usuário não encontrado." }, 404);
  }

  const now = new Date();
  const invitations = await db
    .select({
      id: schema.invitation.id,
      organizationId: schema.invitation.organizationId,
      organizationName: schema.organization.name,
      organizationSlug: schema.organization.slug,
      role: schema.invitation.role,
      status: schema.invitation.status,
      expiresAt: schema.invitation.expiresAt,
      createdAt: schema.invitation.createdAt,
    })
    .from(schema.invitation)
    .innerJoin(schema.organization, eq(schema.invitation.organizationId, schema.organization.id))
    .where(
      and(
        eq(schema.invitation.email, targetUser.email.toLowerCase()),
        eq(schema.invitation.status, "pending"),
        gt(schema.invitation.expiresAt, now)
      )
    );

  return c.json({ invitations });
});

/**
 * POST /me/invitations/:id/accept
 * Accept a pending organization invitation.
 */
userRoutes.post("/me/invitations/:id/accept", async (c) => {
  const identity = await getAuthIdentity(c);
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  const db = c.get("db");
  const inviteId = c.req.param("id");

  const [targetUser] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, identity.userId))
    .limit(1);

  if (!targetUser) {
    return c.json({ error: "NotFound", message: "Usuário não encontrado." }, 404);
  }

  const [invite] = await db
    .select()
    .from(schema.invitation)
    .where(eq(schema.invitation.id, inviteId))
    .limit(1);

  if (!invite) {
    return c.json({ error: "NotFound", message: "Convite não encontrado." }, 404);
  }

  if (invite.email.toLowerCase() !== targetUser.email.toLowerCase()) {
    return c.json(
      { error: "Forbidden", message: "Este convite não pertence ao seu endereço de e-mail." },
      403
    );
  }

  if (invite.status !== "pending" || invite.expiresAt.getTime() < Date.now()) {
    return c.json({ error: "BadRequest", message: "Este convite já foi utilizado ou expirou." }, 400);
  }

  // Quota check: org maxMembers
  const [targetOrg] = await db
    .select()
    .from(schema.organization)
    .where(eq(schema.organization.id, invite.organizationId))
    .limit(1);

  if (targetOrg && targetOrg.maxMembers && targetOrg.maxMembers > 0) {
    const [memberCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.member)
      .where(eq(schema.member.organizationId, targetOrg.id));

    if (memberCount && memberCount.count >= targetOrg.maxMembers) {
      return c.json(
        {
          error: "QuotaExceeded",
          message: `Limite de membros atingido (${targetOrg.maxMembers} membros). A organização precisa atualizar seu plano para aceitar mais membros.`,
        },
        400
      );
    }
  }

  const [existingMember] = await db
    .select()
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, invite.organizationId),
        eq(schema.member.userId, targetUser.id)
      )
    )
    .limit(1);

  const role = invite.role || "member";
  const now = new Date();

  if (!existingMember) {
    const memberId = crypto.randomUUID();
    await db.insert(schema.member).values({
      id: memberId,
      organizationId: invite.organizationId,
      userId: targetUser.id,
      role,
      createdAt: now,
    });
  }

  await db
    .update(schema.invitation)
    .set({ status: "accepted" })
    .where(eq(schema.invitation.id, invite.id));

  await logAuditEvent(db, {
    action: "invitation.accepted",
    actorId: targetUser.id,
    actorEmail: targetUser.email,
    targetId: invite.organizationId,
    targetType: "organization",
    metadata: { role, invitationId: invite.id },
  });

  return c.json({
    success: true,
    message: "Convite aceito com sucesso!",
    organizationId: invite.organizationId,
    role,
  });
});

/**
 * POST /me/invitations/:id/reject
 * Reject a pending organization invitation.
 */
userRoutes.post("/me/invitations/:id/reject", async (c) => {
  const identity = await getAuthIdentity(c);
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  const db = c.get("db");
  const inviteId = c.req.param("id");

  const [targetUser] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, identity.userId))
    .limit(1);

  if (!targetUser) {
    return c.json({ error: "NotFound", message: "Usuário não encontrado." }, 404);
  }

  const [invite] = await db
    .select()
    .from(schema.invitation)
    .where(eq(schema.invitation.id, inviteId))
    .limit(1);

  if (!invite) {
    return c.json({ error: "NotFound", message: "Convite não encontrado." }, 404);
  }

  if (invite.email.toLowerCase() !== targetUser.email.toLowerCase()) {
    return c.json(
      { error: "Forbidden", message: "Este convite não pertence ao seu endereço de e-mail." },
      403
    );
  }

  await db
    .update(schema.invitation)
    .set({ status: "rejected" })
    .where(eq(schema.invitation.id, invite.id));

  await logAuditEvent(db, {
    action: "invitation.rejected",
    actorId: targetUser.id,
    actorEmail: targetUser.email,
    targetId: invite.organizationId,
    targetType: "organization",
    metadata: { invitationId: invite.id },
  });

  return c.json({
    success: true,
    message: "Convite rejeitado com sucesso.",
  });
});

/**
 * GET /api/v1/users
 * List users (M2M Secret Key or Super Admin only)
 */
userRoutes.get("/", async (c) => {
  const identity = await getAuthIdentity(c);
  if (!identity || (!identity.isM2M && !identity.isSuperAdmin)) {
    return c.json({ error: "Unauthorized", message: "Acesso restrito ao backend via Secret Key ou Super Admin." }, 403);
  }

  const db = c.get("db");
  const page = Math.max(1, parseInt(c.req.query("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20")));
  const search = c.req.query("search")?.trim()?.toLowerCase();
  const offset = (page - 1) * limit;

  let query = db.select().from(schema.user);
  if (search) {
    query = query.where(
      or(
        sql`lower(${schema.user.email}) LIKE ${`%${search}%`}`,
        sql`lower(${schema.user.name}) LIKE ${`%${search}%`}`
      )
    ) as any;
  }

  const usersList = await query.limit(limit).offset(offset).orderBy(desc(schema.user.createdAt));
  const [countRes] = await db.select({ count: sql<number>`count(*)` }).from(schema.user);

  return c.json({
    users: usersList.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isSuperAdmin: Boolean(u.isSuperAdmin),
      emailVerified: Boolean(u.emailVerified),
      image: u.image,
      createdAt: u.createdAt,
      lastActiveAt: u.lastActiveAt,
      publicMetadata: safeJsonParse(u.publicMetadata, {}),
      privateMetadata: safeJsonParse(u.privateMetadata, {}),
      unsafeMetadata: safeJsonParse(u.unsafeMetadata, {}),
    })),
    pagination: {
      page,
      limit,
      total: countRes?.count || 0,
    },
  });
});

/**
 * GET /api/v1/users/:id
 * Get single user by ID (M2M or Super Admin, or user reading self)
 */
userRoutes.get("/:id", async (c) => {
  const identity = await getAuthIdentity(c);
  const targetId = c.req.param("id");
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  if (targetId !== identity.userId && !identity.isM2M && !identity.isSuperAdmin) {
    return c.json({ error: "Forbidden", message: "Acesso não autorizado aos dados de outro usuário." }, 403);
  }

  const db = c.get("db");
  const [targetUser] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, targetId))
    .limit(1);

  if (!targetUser) {
    return c.json({ error: "NotFound", message: "Usuário não encontrado." }, 404);
  }

  const authCtx = await resolveUserAuthorizationContext(db, c.env, {
    userId: targetUser.id,
    userRecord: targetUser,
  });

  const res: Record<string, any> = {
    id: targetUser.id,
    name: targetUser.name,
    email: targetUser.email,
    emailVerified: Boolean(targetUser.emailVerified),
    image: targetUser.image,
    role: targetUser.role,
    isSuperAdmin: Boolean(targetUser.isSuperAdmin),
    locale: targetUser.locale,
    timezone: targetUser.timezone,
    theme: targetUser.theme,
    createdAt: targetUser.createdAt,
    updatedAt: targetUser.updatedAt,
    lastActiveAt: targetUser.lastActiveAt,
    publicMetadata: safeJsonParse(targetUser.publicMetadata, {}),
    unsafeMetadata: safeJsonParse(targetUser.unsafeMetadata, {}),
    organization: authCtx.activeOrganization,
    roles: authCtx.roles,
    permissions: authCtx.permissions,
    plan: authCtx.plan,
    entitlements: authCtx.entitlements,
  };

  if (identity.isM2M || identity.isSuperAdmin) {
    res.privateMetadata = safeJsonParse(targetUser.privateMetadata, {});
  }

  return c.json({ user: res });
});

/**
 * PATCH /api/v1/users/:id
 * Update user by ID (M2M or Super Admin)
 */
userRoutes.patch("/:id", async (c) => {
  const identity = await getAuthIdentity(c);
  if (!identity || (!identity.isM2M && !identity.isSuperAdmin)) {
    return c.json({ error: "Unauthorized", message: "Acesso restrito ao backend via Secret Key ou Super Admin." }, 403);
  }

  const targetId = c.req.param("id");
  const db = c.get("db");

  const [existingUser] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, targetId))
    .limit(1);

  if (!existingUser) {
    return c.json({ error: "NotFound", message: "Usuário não encontrado." }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const updateFields: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (body.name !== undefined) updateFields.name = body.name;
  if (body.firstName !== undefined) updateFields.firstName = body.firstName;
  if (body.lastName !== undefined) updateFields.lastName = body.lastName;
  if (body.image !== undefined) updateFields.image = body.image;
  if (body.emailVerified !== undefined) updateFields.emailVerified = Boolean(body.emailVerified);
  if (body.role !== undefined && (identity.isSuperAdmin || existingUser.role !== "super_admin")) {
    updateFields.role = body.role;
  }
  if (body.publicMetadata !== undefined) {
    updateFields.publicMetadata = typeof body.publicMetadata === "string" ? body.publicMetadata : JSON.stringify(body.publicMetadata);
  }
  if (body.privateMetadata !== undefined) {
    updateFields.privateMetadata = typeof body.privateMetadata === "string" ? body.privateMetadata : JSON.stringify(body.privateMetadata);
  }
  if (body.unsafeMetadata !== undefined) {
    updateFields.unsafeMetadata = typeof body.unsafeMetadata === "string" ? body.unsafeMetadata : JSON.stringify(body.unsafeMetadata);
  }

  const [updatedUser] = await db
    .update(schema.user)
    .set(updateFields)
    .where(eq(schema.user.id, existingUser.id))
    .returning();

  await logAuditEvent(db, {
    action: "user.updated_by_admin",
    actorId: identity.userId,
    targetId: existingUser.id,
    targetType: "user",
    metadata: { updatedFields: Object.keys(updateFields) },
  });

  return c.json({ success: true, user: updatedUser });
});

/**
 * DELETE /api/v1/users/:id
 * Delete user by ID (M2M or Super Admin)
 */
userRoutes.delete("/:id", async (c) => {
  const identity = await getAuthIdentity(c);
  if (!identity || (!identity.isM2M && !identity.isSuperAdmin)) {
    return c.json({ error: "Unauthorized", message: "Acesso restrito ao backend via Secret Key ou Super Admin." }, 403);
  }

  const targetId = c.req.param("id");
  const db = c.get("db");

  const [existingUser] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, targetId))
    .limit(1);

  if (!existingUser) {
    return c.json({ error: "NotFound", message: "Usuário não encontrado." }, 404);
  }

  if (existingUser.role === "super_admin" || existingUser.isSuperAdmin) {
    return c.json({ error: "Forbidden", message: "Não é permitido excluir o Super Admin da instalação." }, 403);
  }

  await db.delete(schema.session).where(eq(schema.session.userId, existingUser.id));
  await db.delete(schema.member).where(eq(schema.member.userId, existingUser.id));
  await db.delete(schema.userRole).where(eq(schema.userRole.userId, existingUser.id));
  await db.delete(schema.user).where(eq(schema.user.id, existingUser.id));

  await logAuditEvent(db, {
    action: "user.deleted_by_admin",
    actorId: identity.userId,
    targetId: existingUser.id,
    targetType: "user",
    metadata: { email: existingUser.email },
  });

  return c.json({ success: true, message: "Usuário excluído com sucesso." });
});
