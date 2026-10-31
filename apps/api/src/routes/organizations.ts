import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "@/types/env";
import * as schema from "@/db/schema";
import { eq, and, sql, desc, or } from "drizzle-orm";
import { verifyApiKey } from "@/lib/api-keys";
import { logAuditEvent } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";
import { sendOrganizationInviteEmail } from "@/lib/email";
import { isUserSuperAdmin } from "@/lib/access-control";

export const organizationRoutes = new Hono<AppContext>();

interface OrgAuthIdentity {
  userId: string;
  isM2M: boolean;
  isSuperAdmin: boolean;
}

/**
 * Authenticates user session or M2M Secret Key
 */
async function getOrgAuthIdentity(c: any): Promise<OrgAuthIdentity | null> {
  const auth = c.get("auth");
  const db = c.get("db");

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

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session && session.user) {
    return {
      userId: session.user.id,
      isM2M: false,
      isSuperAdmin: isUserSuperAdmin(session.user),
    };
  }

  return null;
}

/**
 * Helper to check caller membership and permissions in an organization
 */
async function getCallerOrgMembership(db: any, orgId: string, userId: string) {
  const [m] = await db
    .select({
      member: schema.member,
      org: schema.organization,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
    .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)))
    .limit(1);

  if (!m) return null;

  let permissions: string[] = [];
  const [customRole] = await db
    .select()
    .from(schema.organizationRole)
    .where(
      and(
        eq(schema.organizationRole.organizationId, orgId),
        eq(schema.organizationRole.role, m.member.role)
      )
    )
    .limit(1);

  if (customRole && customRole.permission) {
    try {
      const parsed = JSON.parse(customRole.permission);
      permissions = Array.isArray(parsed) ? parsed : (Object.values(parsed).flat() as string[]);
    } catch {}
  } else {
    if (m.member.role === "owner") {
      permissions = [
        "org:delete",
        "org:update",
        "org:transfer_ownership",
        "org:members:invite",
        "org:members:manage",
        "org:billing:manage",
        "org:view",
      ];
    } else if (m.member.role === "admin") {
      permissions = [
        "org:update",
        "org:members:invite",
        "org:members:manage",
        "org:billing:read",
        "org:view",
      ];
    } else {
      permissions = ["org:view"];
    }
  }

  return {
    ...m,
    permissions,
  };
}

/**
 * GET /api/v1/organizations
 * List organizations. If M2M without target user, lists all organizations.
 * Otherwise lists organizations where caller is a member.
 */
organizationRoutes.get("/", async (c) => {
  const identity = await getOrgAuthIdentity(c);
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  const db = c.get("db");

  if (identity.isM2M && (!c.req.header("x-user-id") || identity.userId === "system")) {
    const page = Math.max(1, parseInt(c.req.query("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20")));
    const offset = (page - 1) * limit;

    const list = await db
      .select()
      .from(schema.organization)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(schema.organization.createdAt));

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.organization);

    return c.json({
      organizations: list,
      pagination: {
        page,
        limit,
        total: countResult?.count || 0,
      },
    });
  }

  const memberships = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
      logo: schema.organization.logo,
      metadata: schema.organization.metadata,
      maxMembers: schema.organization.maxMembers,
      role: schema.member.role,
      joinedAt: schema.member.createdAt,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
    .where(eq(schema.member.userId, identity.userId))
    .orderBy(desc(schema.member.createdAt));

  return c.json({ organizations: memberships });
});

const createOrgSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(100).optional(),
  logo: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
  maxMembers: z.number().int().positive().optional(),
});

/**
 * POST /api/v1/organizations
 * Create a new organization. Caller becomes owner.
 */
organizationRoutes.post("/", async (c) => {
  const identity = await getOrgAuthIdentity(c);
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  const db = c.get("db");
  const env = c.env;

  // Check allowUserOrgCreation setting if consumer user
  let defaultMaxMembers: number | null = null;
  const [setting] = await db
    .select()
    .from(schema.installationSettings)
    .where(eq(schema.installationSettings.id, "default"))
    .limit(1);

  if (setting) {
    defaultMaxMembers = setting.defaultOrgMaxMembers || null;
    if (!identity.isM2M && !identity.isSuperAdmin && setting.allowUserOrgCreation === false) {
      return c.json(
        {
          error: "Forbidden",
          message: "A criação de organizações por usuários está desabilitada nesta instalação.",
        },
        403
      );
    }
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "BadRequest", message: "JSON inválido." }, 400);
  }

  const parsed = createOrgSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "ValidationError", issues: parsed.error.issues }, 400);
  }

  const data = parsed.data;
  const orgId = crypto.randomUUID();
  const slug = (
    data.slug ||
    data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + orgId.slice(0, 6)
  ).toLowerCase();

  // Check slug uniqueness
  const [existingSlug] = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(eq(schema.organization.slug, slug))
    .limit(1);

  if (existingSlug) {
    return c.json({ error: "Conflict", message: "Slug da organização já está em uso." }, 409);
  }

  const now = new Date();
  const [createdOrg] = await db
    .insert(schema.organization)
    .values({
      id: orgId,
      name: data.name,
      slug,
      logo: data.logo || null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      maxMembers: data.maxMembers !== undefined ? data.maxMembers : defaultMaxMembers,
      createdAt: now,
    })
    .returning();

  // Assign caller as owner if user exists
  if (identity.userId && identity.userId !== "system") {
    await db.insert(schema.member).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      userId: identity.userId,
      role: "owner",
      createdAt: now,
    });
  }

  await logAuditEvent(db, {
    action: "organization.created",
    actorId: identity.userId,
    targetId: orgId,
    targetType: "organization",
    metadata: { name: data.name, slug },
  });

  if (env.WEBHOOK_URL) {
    await dispatchWebhook(env, {
      event: "organization.created",
      data: {
        id: orgId,
        name: data.name,
        slug,
        ownerId: identity.userId,
        createdAt: now,
      },
    });
  }

  return c.json({ success: true, organization: createdOrg }, 201);
});

/**
 * GET /api/v1/organizations/:orgId
 * Retrieve organization details with member count and caller's role.
 */
organizationRoutes.get("/:orgId", async (c) => {
  const identity = await getOrgAuthIdentity(c);
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  const db = c.get("db");
  const orgId = c.req.param("orgId");

  const [org] = await db
    .select()
    .from(schema.organization)
    .where(or(eq(schema.organization.id, orgId), eq(schema.organization.slug, orgId)))
    .limit(1);

  if (!org) {
    return c.json({ error: "NotFound", message: "Organização não encontrada." }, 404);
  }

  let membership: any = null;
  if (!identity.isM2M && !identity.isSuperAdmin) {
    membership = await getCallerOrgMembership(db, org.id, identity.userId);
    if (!membership) {
      return c.json({ error: "Forbidden", message: "Você não tem acesso a esta organização." }, 403);
    }
  }

  const [memberCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.member)
    .where(eq(schema.member.organizationId, org.id));

  return c.json({
    organization: {
      ...org,
      membersCount: memberCount?.count || 0,
      currentUserRole: membership?.member?.role || (identity.isSuperAdmin ? "super_admin" : null),
      currentUserPermissions: membership?.permissions || (identity.isSuperAdmin ? ["*"] : []),
    },
  });
});

const patchOrgSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  slug: z.string().min(2).max(100).optional(),
  logo: z.string().max(500).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  maxMembers: z.number().int().positive().nullable().optional(),
});

/**
 * PATCH /api/v1/organizations/:orgId
 * Update organization properties. Requires org:update or owner/admin or M2M/Super Admin.
 */
organizationRoutes.patch("/:orgId", async (c) => {
  const identity = await getOrgAuthIdentity(c);
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  const db = c.get("db");
  const env = c.env;
  const orgId = c.req.param("orgId");

  const [org] = await db
    .select()
    .from(schema.organization)
    .where(or(eq(schema.organization.id, orgId), eq(schema.organization.slug, orgId)))
    .limit(1);

  if (!org) {
    return c.json({ error: "NotFound", message: "Organização não encontrada." }, 404);
  }

  if (!identity.isM2M && !identity.isSuperAdmin) {
    const membership = await getCallerOrgMembership(db, org.id, identity.userId);
    if (!membership || (!membership.permissions.includes("org:update") && membership.member.role !== "owner")) {
      return c.json({ error: "Forbidden", message: "Permissão insuficiente para atualizar organização." }, 403);
    }
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "BadRequest", message: "JSON inválido." }, 400);
  }

  const parsed = patchOrgSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "ValidationError", issues: parsed.error.issues }, 400);
  }

  const data = parsed.data;
  const updateData: Record<string, any> = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.logo !== undefined) updateData.logo = data.logo;
  if (data.slug !== undefined) updateData.slug = data.slug.toLowerCase();
  if (data.metadata !== undefined) updateData.metadata = JSON.stringify(data.metadata);

  // maxMembers can only be changed by M2M or Super Admin, or if authorized
  if (data.maxMembers !== undefined) {
    if (identity.isM2M || identity.isSuperAdmin) {
      updateData.maxMembers = data.maxMembers;
    }
  }

  const [updatedOrg] = await db
    .update(schema.organization)
    .set(updateData)
    .where(eq(schema.organization.id, org.id))
    .returning();

  await logAuditEvent(db, {
    action: "organization.updated",
    actorId: identity.userId,
    targetId: org.id,
    targetType: "organization",
    metadata: { updatedFields: Object.keys(updateData) },
  });

  if (env.WEBHOOK_URL) {
    await dispatchWebhook(env, {
      event: "organization.updated",
      data: updatedOrg,
    });
  }

  return c.json({ success: true, organization: updatedOrg });
});

/**
 * DELETE /api/v1/organizations/:orgId
 * Delete organization. Requires owner role or M2M/Super Admin.
 */
organizationRoutes.delete("/:orgId", async (c) => {
  const identity = await getOrgAuthIdentity(c);
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  const db = c.get("db");
  const env = c.env;
  const orgId = c.req.param("orgId");

  const [org] = await db
    .select()
    .from(schema.organization)
    .where(or(eq(schema.organization.id, orgId), eq(schema.organization.slug, orgId)))
    .limit(1);

  if (!org) {
    return c.json({ error: "NotFound", message: "Organização não encontrada." }, 404);
  }

  if (!identity.isM2M && !identity.isSuperAdmin) {
    const membership = await getCallerOrgMembership(db, org.id, identity.userId);
    if (!membership || membership.member.role !== "owner") {
      return c.json({ error: "Forbidden", message: "Apenas o proprietário pode excluir a organização." }, 403);
    }
  }

  // Cascading cleanup
  await db.delete(schema.member).where(eq(schema.member.organizationId, org.id));
  await db.delete(schema.invitation).where(eq(schema.invitation.organizationId, org.id));
  await db.delete(schema.organizationRole).where(eq(schema.organizationRole.organizationId, org.id));
  await db.delete(schema.organization).where(eq(schema.organization.id, org.id));

  await logAuditEvent(db, {
    action: "organization.deleted",
    actorId: identity.userId,
    targetId: org.id,
    targetType: "organization",
    metadata: { name: org.name, slug: org.slug },
  });

  if (env.WEBHOOK_URL) {
    await dispatchWebhook(env, {
      event: "organization.deleted",
      data: { id: org.id, name: org.name, slug: org.slug },
    });
  }

  return c.json({ success: true, message: "Organização excluída com sucesso." });
});

/**
 * POST /api/v1/organizations/:orgId/transfer-ownership
 * Atomically transfer organization ownership to another existing member.
 */
organizationRoutes.post("/:orgId/transfer-ownership", async (c) => {
  const identity = await getOrgAuthIdentity(c);
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  const db = c.get("db");
  const env = c.env;
  const orgId = c.req.param("orgId");

  const [org] = await db
    .select()
    .from(schema.organization)
    .where(or(eq(schema.organization.id, orgId), eq(schema.organization.slug, orgId)))
    .limit(1);

  if (!org) {
    return c.json({ error: "NotFound", message: "Organização não encontrada." }, 404);
  }

  if (!identity.isM2M && !identity.isSuperAdmin) {
    const membership = await getCallerOrgMembership(db, org.id, identity.userId);
    if (!membership || membership.member.role !== "owner") {
      return c.json({ error: "Forbidden", message: "Apenas o proprietário atual pode transferir a propriedade." }, 403);
    }
  }

  const body = await c.req.json().catch(() => ({}));
  const newOwnerId = body.newOwnerId;

  if (!newOwnerId) {
    return c.json({ error: "BadRequest", message: "newOwnerId é obrigatório." }, 400);
  }

  const [targetMember] = await db
    .select()
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, org.id), eq(schema.member.userId, newOwnerId)))
    .limit(1);

  if (!targetMember) {
    return c.json({ error: "BadRequest", message: "O novo proprietário deve ser membro da organização." }, 400);
  }

  // Atomically update roles
  // 1. Current owner becomes admin
  await db
    .update(schema.member)
    .set({ role: "admin" })
    .where(and(eq(schema.member.organizationId, org.id), eq(schema.member.role, "owner")));

  // 2. New owner becomes owner
  await db
    .update(schema.member)
    .set({ role: "owner" })
    .where(eq(schema.member.id, targetMember.id));

  await logAuditEvent(db, {
    action: "organization.ownership_transferred",
    actorId: identity.userId,
    targetId: org.id,
    targetType: "organization",
    metadata: { previousOwnerId: identity.userId, newOwnerId },
  });

  if (env.WEBHOOK_URL) {
    await dispatchWebhook(env, {
      event: "organization.ownership_transferred",
      data: { organizationId: org.id, newOwnerId, previousOwnerId: identity.userId },
    });
  }

  return c.json({ success: true, message: "Propriedade da organização transferida com sucesso." });
});

/**
 * GET /api/v1/organizations/:orgId/members
 * List all members of an organization.
 */
organizationRoutes.get("/:orgId/members", async (c) => {
  const identity = await getOrgAuthIdentity(c);
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  const db = c.get("db");
  const orgId = c.req.param("orgId");

  const [org] = await db
    .select()
    .from(schema.organization)
    .where(or(eq(schema.organization.id, orgId), eq(schema.organization.slug, orgId)))
    .limit(1);

  if (!org) {
    return c.json({ error: "NotFound", message: "Organização não encontrada." }, 404);
  }

  if (!identity.isM2M && !identity.isSuperAdmin) {
    const membership = await getCallerOrgMembership(db, org.id, identity.userId);
    if (!membership) {
      return c.json({ error: "Forbidden", message: "Você não tem acesso a esta organização." }, 403);
    }
  }

  const membersList = await db
    .select({
      id: schema.member.id,
      userId: schema.member.userId,
      role: schema.member.role,
      joinedAt: schema.member.createdAt,
      user: {
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        image: schema.user.image,
      },
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(eq(schema.member.organizationId, org.id))
    .orderBy(desc(schema.member.createdAt));

  return c.json({ members: membersList });
});

/**
 * PATCH /api/v1/organizations/:orgId/members/:memberId
 * Update a member's role in the organization.
 */
organizationRoutes.patch("/:orgId/members/:memberId", async (c) => {
  const identity = await getOrgAuthIdentity(c);
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  const db = c.get("db");
  const env = c.env;
  const { orgId, memberId } = c.req.param();

  const [org] = await db
    .select()
    .from(schema.organization)
    .where(or(eq(schema.organization.id, orgId), eq(schema.organization.slug, orgId)))
    .limit(1);

  if (!org) {
    return c.json({ error: "NotFound", message: "Organização não encontrada." }, 404);
  }

  if (!identity.isM2M && !identity.isSuperAdmin) {
    const callerMembership = await getCallerOrgMembership(db, org.id, identity.userId);
    if (!callerMembership || (!callerMembership.permissions.includes("org:members:manage") && callerMembership.member.role !== "owner")) {
      return c.json({ error: "Forbidden", message: "Permissão insuficiente para gerenciar membros." }, 403);
    }
  }

  const body = await c.req.json().catch(() => ({}));
  const newRole = body.role;
  if (!newRole || typeof newRole !== "string") {
    return c.json({ error: "BadRequest", message: "Campo 'role' é obrigatório." }, 400);
  }

  const [targetMember] = await db
    .select()
    .from(schema.member)
    .where(and(eq(schema.member.id, memberId), eq(schema.member.organizationId, org.id)))
    .limit(1);

  if (!targetMember) {
    return c.json({ error: "NotFound", message: "Membro não encontrado." }, 404);
  }

  if (targetMember.role === "owner" && newRole !== "owner") {
    return c.json(
      { error: "BadRequest", message: "Não é possível rebaixar o proprietário. Transfira a propriedade primeiro." },
      400
    );
  }

  const [updated] = await db
    .update(schema.member)
    .set({ role: newRole })
    .where(eq(schema.member.id, targetMember.id))
    .returning();

  await logAuditEvent(db, {
    action: "organization.member_updated",
    actorId: identity.userId,
    targetId: org.id,
    targetType: "organization",
    metadata: { memberId, oldRole: targetMember.role, newRole },
  });

  if (env.WEBHOOK_URL) {
    await dispatchWebhook(env, {
      event: "organization.member_updated",
      data: { organizationId: org.id, memberId, role: newRole },
    });
  }

  return c.json({ success: true, member: updated });
});

/**
 * DELETE /api/v1/organizations/:orgId/members/:memberId
 * Remove member or leave organization.
 */
organizationRoutes.delete("/:orgId/members/:memberId", async (c) => {
  const identity = await getOrgAuthIdentity(c);
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  const db = c.get("db");
  const env = c.env;
  const { orgId, memberId } = c.req.param();

  const [org] = await db
    .select()
    .from(schema.organization)
    .where(or(eq(schema.organization.id, orgId), eq(schema.organization.slug, orgId)))
    .limit(1);

  if (!org) {
    return c.json({ error: "NotFound", message: "Organização não encontrada." }, 404);
  }

  const [targetMember] = await db
    .select()
    .from(schema.member)
    .where(and(eq(schema.member.id, memberId), eq(schema.member.organizationId, org.id)))
    .limit(1);

  if (!targetMember) {
    return c.json({ error: "NotFound", message: "Membro não encontrado." }, 404);
  }

  // Prevent removing owner without transfer
  if (targetMember.role === "owner") {
    return c.json(
      { error: "BadRequest", message: "O proprietário não pode ser removido ou sair da organização sem transferir a propriedade." },
      400
    );
  }

  // Caller must either be the member themselves (leaving) or have permission to manage members
  const isSelf = targetMember.userId === identity.userId;
  if (!isSelf && !identity.isM2M && !identity.isSuperAdmin) {
    const callerMembership = await getCallerOrgMembership(db, org.id, identity.userId);
    if (!callerMembership || (!callerMembership.permissions.includes("org:members:manage") && callerMembership.member.role !== "owner")) {
      return c.json({ error: "Forbidden", message: "Permissão insuficiente para remover este membro." }, 403);
    }
  }

  await db.delete(schema.member).where(eq(schema.member.id, targetMember.id));

  await logAuditEvent(db, {
    action: isSelf ? "organization.member_left" : "organization.member_removed",
    actorId: identity.userId,
    targetId: org.id,
    targetType: "organization",
    metadata: { memberId, userId: targetMember.userId },
  });

  if (env.WEBHOOK_URL) {
    await dispatchWebhook(env, {
      event: "organization.member_removed",
      data: { organizationId: org.id, memberId, userId: targetMember.userId },
    });
  }

  return c.json({ success: true, message: isSelf ? "Você saiu da organização." : "Membro removido com sucesso." });
});

/**
 * POST /api/v1/organizations/:orgId/invitations
 * Create an invitation for a member to join the organization, respecting maxMembers quota.
 */
organizationRoutes.post("/:orgId/invitations", async (c) => {
  const identity = await getOrgAuthIdentity(c);
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  const db = c.get("db");
  const env = c.env;
  const orgId = c.req.param("orgId");

  const [org] = await db
    .select()
    .from(schema.organization)
    .where(or(eq(schema.organization.id, orgId), eq(schema.organization.slug, orgId)))
    .limit(1);

  if (!org) {
    return c.json({ error: "NotFound", message: "Organização não encontrada." }, 404);
  }

  if (!identity.isM2M && !identity.isSuperAdmin) {
    const callerMembership = await getCallerOrgMembership(db, org.id, identity.userId);
    if (!callerMembership || (!callerMembership.permissions.includes("org:members:invite") && callerMembership.member.role !== "owner")) {
      return c.json({ error: "Forbidden", message: "Permissão insuficiente para convidar membros." }, 403);
    }
  }

  const body = await c.req.json().catch(() => ({}));
  const email = body.email?.trim()?.toLowerCase();
  const role = body.role || "member";

  if (!email || !email.includes("@")) {
    return c.json({ error: "BadRequest", message: "E-mail de convite inválido." }, 400);
  }

  // Quota check: org.maxMembers
  if (org.maxMembers && org.maxMembers > 0) {
    const [memberCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.member)
      .where(eq(schema.member.organizationId, org.id));

    if (memberCount && memberCount.count >= org.maxMembers) {
      return c.json(
        {
          error: "QuotaExceeded",
          message: `Limite de membros atingido (${org.maxMembers} membros). Faça upgrade do plano para convidar mais membros.`,
        },
        400
      );
    }
  }

  // Check if already a member
  const [existingUser] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);

  if (existingUser) {
    const [isMember] = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(and(eq(schema.member.organizationId, org.id), eq(schema.member.userId, existingUser.id)))
      .limit(1);

    if (isMember) {
      return c.json({ error: "Conflict", message: "Este usuário já é membro da organização." }, 409);
    }
  }

  // Create invitation
  const inviteId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const [invite] = await db
    .insert(schema.invitation)
    .values({
      id: inviteId,
      organizationId: org.id,
      email,
      role,
      status: "pending",
      expiresAt,
      createdAt: new Date(),
      inviterId: identity.userId !== "system" ? identity.userId : (existingUser?.id || org.id),
    })
    .returning();

  // Send invitation email
  const clientBase = env.APP_URL || env.BETTER_AUTH_URL || "http://localhost:8787";
  const inviteUrl = `${clientBase}/accept-invitation?id=${inviteId}`;
  await sendOrganizationInviteEmail({
    email,
    organizationName: org.name,
    role,
    inviteUrl,
    env,
  });

  await logAuditEvent(db, {
    action: "organization.invitation_created",
    actorId: identity.userId,
    targetId: org.id,
    targetType: "organization",
    metadata: { email, role, inviteId },
  });

  if (env.WEBHOOK_URL) {
    await dispatchWebhook(env, {
      event: "organization.invitation_created",
      data: { organizationId: org.id, email, role, inviteId },
    });
  }

  return c.json({ success: true, invitation: invite }, 201);
});

/**
 * DELETE /api/v1/organizations/:orgId/invitations/:inviteId
 * Cancel an invitation.
 */
organizationRoutes.delete("/:orgId/invitations/:inviteId", async (c) => {
  const identity = await getOrgAuthIdentity(c);
  if (!identity) {
    return c.json({ error: "Unauthorized", message: "Autenticação necessária." }, 401);
  }

  const db = c.get("db");
  const { orgId, inviteId } = c.req.param();

  const [org] = await db
    .select()
    .from(schema.organization)
    .where(or(eq(schema.organization.id, orgId), eq(schema.organization.slug, orgId)))
    .limit(1);

  if (!org) {
    return c.json({ error: "NotFound", message: "Organização não encontrada." }, 404);
  }

  if (!identity.isM2M && !identity.isSuperAdmin) {
    const callerMembership = await getCallerOrgMembership(db, org.id, identity.userId);
    if (!callerMembership || (!callerMembership.permissions.includes("org:members:invite") && callerMembership.member.role !== "owner")) {
      return c.json({ error: "Forbidden", message: "Permissão insuficiente para cancelar convites." }, 403);
    }
  }

  await db
    .delete(schema.invitation)
    .where(and(eq(schema.invitation.id, inviteId), eq(schema.invitation.organizationId, org.id)));

  return c.json({ success: true, message: "Convite cancelado com sucesso." });
});
