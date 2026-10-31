import { Hono } from "hono";
import type { AppContext } from "@/types/env";
import * as schema from "@/db/schema";
import { eq, sql, gt, desc } from "drizzle-orm";
import { generateApiKey, verifyApiKey } from "@/lib/api-keys";
import { logAuditEvent } from "@/lib/audit";
import { signWebhookPayload } from "@/lib/webhooks";

export const adminRoutes = new Hono<AppContext>();

/**
 * Middleware de Segurança: Exige sessão ativa com papel 'admin' OU M2M API Key válida com papel 'admin'.
 */
adminRoutes.use("*", async (c, next) => {
  const auth = c.get("auth");
  const db = c.get("db");

  // 1. Verificar autenticação via M2M Secret API Key (Header Authorization ou x-api-key)
  const authHeader = c.req.header("authorization") || "";
  const xApiKey = c.req.header("x-api-key") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : xApiKey.trim();

  if (token && (token.startsWith("sk_") || token.startsWith("ek_"))) {
    const apiKeyRecord = await verifyApiKey(db, token);
    if (apiKeyRecord && apiKeyRecord.role === "admin") {
      c.set("userId", apiKeyRecord.createdById || "system");
      c.set("apiKeyId", apiKeyRecord.id);
      return next();
    }
  }

  // 2. Verificar autenticação via Sessão do Better Auth (Cookie)
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const isSuperAdmin = Boolean(
    (session?.user as any)?.isSuperAdmin ||
    (session?.user as any)?.role === "super_admin" ||
    (session?.user as any)?.role === "admin"
  );

  if (!session || !isSuperAdmin) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Acesso não autorizado: privilégios de super-administrador ou Secret Key válidos são necessários",
      },
      403
    );
  }

  c.set("userId", session.user.id);
  c.set("sessionId", session.session.id);
  await next();
});

/**
 * GET /api/admin/stats
 * Retorna contagens agregadas em tempo real diretamente do D1.
 */
adminRoutes.get("/stats", async (c) => {
  const db = c.get("db");
  const now = new Date();

  const [usersRes] = await db.select({ count: sql<number>`count(*)` }).from(schema.user);
  const [adminsRes] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.user)
    .where(sql`${schema.user.role} IN ('admin', 'super_admin') OR ${schema.user.isSuperAdmin} = 1`);
  const [bannedRes] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.user)
    .where(eq(schema.user.banned, true));
  const [orgsRes] = await db.select({ count: sql<number>`count(*)` }).from(schema.organization);
  const [membersRes] = await db.select({ count: sql<number>`count(*)` }).from(schema.member);
  const [sessionsRes] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.session)
    .where(gt(schema.session.expiresAt, now));
  const [passkeysRes] = await db
    .select({ count: sql<number>`count(distinct ${schema.passkey.userId})` })
    .from(schema.passkey);
  const [twoFactorRes] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.user)
    .where(eq(schema.user.twoFactorEnabled, true));
  const [apiKeysRes] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.apiKey)
    .where(sql`${schema.apiKey.revokedAt} IS NULL`);

  return c.json({
    totalUsers: Number(usersRes?.count || 0),
    totalAdmins: Number(adminsRes?.count || 0),
    totalBanned: Number(bannedRes?.count || 0),
    totalOrganizations: Number(orgsRes?.count || 0),
    totalMembers: Number(membersRes?.count || 0),
    activeSessions: Number(sessionsRes?.count || 0),
    passkeyUsers: Number(passkeysRes?.count || 0),
    twoFactorUsers: Number(twoFactorRes?.count || 0),
    activeApiKeys: Number(apiKeysRes?.count || 0),
  });
});

/**
 * GET /api/admin/organizations
 * Lista global de todas as organizações da instância.
 */
adminRoutes.get("/organizations", async (c) => {
  const db = c.get("db");
  const search = c.req.query("search")?.toLowerCase();

  const orgs = await db.select().from(schema.organization).orderBy(desc(schema.organization.createdAt));

  const results = await Promise.all(
    orgs
      .filter((o) => !search || o.name.toLowerCase().includes(search) || o.slug.toLowerCase().includes(search))
      .map(async (org) => {
        const [membersCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(schema.member)
          .where(eq(schema.member.organizationId, org.id));

        const [invitationsCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(schema.invitation)
          .where(eq(schema.invitation.organizationId, org.id));

        const [ownerMember] = await db
          .select({
            role: schema.member.role,
            userId: schema.member.userId,
            userName: schema.user.name,
            userEmail: schema.user.email,
          })
          .from(schema.member)
          .leftJoin(schema.user, eq(schema.member.userId, schema.user.id))
          .where(eq(schema.member.organizationId, org.id))
          .orderBy(schema.member.createdAt)
          .limit(1);

        return {
          ...org,
          membersCount: Number(membersCount?.count || 0),
          invitationsCount: Number(invitationsCount?.count || 0),
          owner: ownerMember
            ? {
                id: ownerMember.userId,
                name: ownerMember.userName,
                email: ownerMember.userEmail,
                role: ownerMember.role,
              }
            : null,
        };
      })
  );

  return c.json({ organizations: results });
});

/**
 * GET /api/admin/organizations/:id
 */
adminRoutes.get("/organizations/:id", async (c) => {
  const db = c.get("db");
  const orgId = c.req.param("id");

  const [org] = await db.select().from(schema.organization).where(eq(schema.organization.id, orgId)).limit(1);
  if (!org) {
    return c.json({ error: "NotFound", message: "Organização não encontrada" }, 404);
  }

  const members = await db
    .select({
      id: schema.member.id,
      role: schema.member.role,
      createdAt: schema.member.createdAt,
      userId: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      image: schema.user.image,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(eq(schema.member.organizationId, orgId))
    .orderBy(desc(schema.member.createdAt));

  const invitations = await db
    .select()
    .from(schema.invitation)
    .where(eq(schema.invitation.organizationId, orgId))
    .orderBy(desc(schema.invitation.createdAt));

  return c.json({
    organization: org,
    members,
    invitations,
  });
});

/**
 * DELETE /api/admin/organizations/:id
 */
adminRoutes.delete("/organizations/:id", async (c) => {
  const db = c.get("db");
  const orgId = c.req.param("id");

  const [org] = await db.select().from(schema.organization).where(eq(schema.organization.id, orgId)).limit(1);
  if (!org) {
    return c.json({ error: "NotFound", message: "Organização não encontrada" }, 404);
  }

  await db.delete(schema.invitation).where(eq(schema.invitation.organizationId, orgId));
  await db.delete(schema.member).where(eq(schema.member.organizationId, orgId));
  await db.delete(schema.organization).where(eq(schema.organization.id, orgId));

  await logAuditEvent(db, {
    action: "organization.deleted",
    actorId: c.get("userId"),
    targetId: orgId,
    targetType: "organization",
    metadata: { name: org.name, slug: org.slug },
  });

  return c.json({ success: true, message: "Organização removida com sucesso" });
});

/**
 * ============================================================================
 * M2M API KEYS (Machine-to-Machine Secret Keys)
 * ============================================================================
 */

/**
 * GET /api/admin/api-keys
 * Lista todas as chaves de API da instância (Publishable e Secret, sem expor hashes de segurança).
 */
adminRoutes.get("/api-keys", async (c) => {
  const db = c.get("db");

  const keys = await db
    .select({
      id: schema.apiKey.id,
      name: schema.apiKey.name,
      prefix: schema.apiKey.prefix,
      keyType: schema.apiKey.keyType,
      environment: schema.apiKey.environment,
      allowedOrigins: schema.apiKey.allowedOrigins,
      displayKey: schema.apiKey.displayKey,
      role: schema.apiKey.role,
      createdAt: schema.apiKey.createdAt,
      expiresAt: schema.apiKey.expiresAt,
      lastUsedAt: schema.apiKey.lastUsedAt,
      revokedAt: schema.apiKey.revokedAt,
      createdById: schema.apiKey.createdById,
      metadata: schema.apiKey.metadata,
    })
    .from(schema.apiKey)
    .orderBy(desc(schema.apiKey.createdAt));

  return c.json({ apiKeys: keys });
});

/**
 * POST /api/admin/api-keys
 * Gera uma nova API Key (Publishable pk_... ou Secret sk_...) e retorna o segredo bruto apenas uma vez.
 */
adminRoutes.post("/api-keys", async (c) => {
  const db = c.get("db");
  const body = await c.req.json().catch(() => ({}));

  const name = body.name?.trim() || "Nova Chave de API";
  const rawPrefix = (body.prefix || "sk_live").trim();
  const validPrefixes = ["pk_live", "pk_test", "sk_live", "sk_test", "ek_live", "ek_test"] as const;
  const prefix = (validPrefixes.includes(rawPrefix as any) ? rawPrefix : "sk_live") as any;

  const role = body.role === "read_only" ? "read_only" : "admin";
  const expiresInDays = Number(body.expiresInDays);
  const allowedOrigins = Array.isArray(body.allowedOrigins)
    ? JSON.stringify(body.allowedOrigins.map((o: string) => o.trim()).filter(Boolean))
    : null;

  const expiresAt = expiresInDays > 0 ? new Date(Date.now() + expiresInDays * 86400 * 1000) : null;

  const { rawKey, keyHash, displayKey, keyType, environment } = await generateApiKey(prefix);
  const id = `key_${crypto.randomUUID()}`;
  const now = new Date();

  await db.insert(schema.apiKey).values({
    id,
    name,
    prefix,
    keyType,
    environment,
    allowedOrigins,
    keyHash,
    displayKey,
    role,
    createdAt: now,
    expiresAt,
    createdById: c.get("userId") || null,
    metadata: body.metadata ? JSON.stringify(body.metadata) : null,
  });

  await logAuditEvent(db, {
    action: "api_key.created",
    actorId: c.get("userId"),
    targetId: id,
    targetType: "api_key",
    metadata: { name, prefix, keyType, environment, role, displayKey },
  });

  return c.json({
    apiKey: {
      id,
      name,
      prefix,
      keyType,
      environment,
      allowedOrigins: allowedOrigins ? JSON.parse(allowedOrigins) : [],
      displayKey,
      role,
      createdAt: now,
      expiresAt,
      rawKey, // Exibido apenas nesta resposta
    },
  });
});

/**
 * ============================================================================
 * USER METADATA (3-Tier: publicMetadata, privateMetadata, unsafeMetadata)
 * ============================================================================
 */

/**
 * GET /api/admin/users/:id/metadata
 */
adminRoutes.get("/users/:id/metadata", async (c) => {
  const db = c.get("db");
  const userId = c.req.param("id");

  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, userId)).limit(1);
  if (!u) {
    return c.json({ error: "NotFound", message: "Usuário não encontrado" }, 404);
  }

  let publicMetadata = {};
  let privateMetadata = {};
  let unsafeMetadata = {};
  let preferences = {};

  try {
    if (u.publicMetadata) publicMetadata = JSON.parse(u.publicMetadata);
  } catch {}
  try {
    if (u.privateMetadata) privateMetadata = JSON.parse(u.privateMetadata);
  } catch {}
  try {
    if (u.unsafeMetadata) unsafeMetadata = JSON.parse(u.unsafeMetadata);
  } catch {}
  try {
    if (u.preferences) preferences = JSON.parse(u.preferences);
  } catch {}

  return c.json({
    userId,
    publicMetadata,
    privateMetadata,
    unsafeMetadata,
    preferences,
    isSuperAdmin: Boolean(u.isSuperAdmin),
    username: u.username,
    displayUsername: u.displayUsername,
    phoneNumber: u.phoneNumber,
    isAnonymous: Boolean(u.isAnonymous),
    locale: u.locale,
    timezone: u.timezone,
    theme: u.theme,
  });
});

/**
 * PATCH /api/admin/users/:id/metadata
 * Updates user metadata in 3 tiers and user preferences. Only super-admin or secret key can call this.
 */
adminRoutes.patch("/users/:id/metadata", async (c) => {
  const db = c.get("db");
  const userId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, userId)).limit(1);
  if (!u) {
    return c.json({ error: "NotFound", message: "Usuário não encontrado" }, 404);
  }

  const updates: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (body.publicMetadata !== undefined) {
    updates.publicMetadata = JSON.stringify(body.publicMetadata);
  }
  if (body.privateMetadata !== undefined) {
    updates.privateMetadata = JSON.stringify(body.privateMetadata);
  }
  if (body.unsafeMetadata !== undefined) {
    updates.unsafeMetadata = JSON.stringify(body.unsafeMetadata);
  }
  if (body.preferences !== undefined) {
    updates.preferences = JSON.stringify(body.preferences);
  }
  if (typeof body.isSuperAdmin === "boolean") {
    updates.isSuperAdmin = body.isSuperAdmin;
  }
  if (body.username !== undefined) {
    updates.username = body.username;
  }
  if (body.phoneNumber !== undefined) {
    updates.phoneNumber = body.phoneNumber;
  }
  if (body.locale !== undefined) {
    updates.locale = body.locale;
  }
  if (body.timezone !== undefined) {
    updates.timezone = body.timezone;
  }
  if (body.theme !== undefined) {
    updates.theme = body.theme;
  }

  await db.update(schema.user).set(updates).where(eq(schema.user.id, userId));

  await logAuditEvent(db, {
    action: "user.metadata_updated",
    actorId: c.get("userId"),
    targetId: userId,
    targetType: "user",
    metadata: {
      hasPublic: body.publicMetadata !== undefined,
      hasPrivate: body.privateMetadata !== undefined,
      hasUnsafe: body.unsafeMetadata !== undefined,
    },
  });

  return c.json({ success: true, message: "Metadados atualizados com sucesso" });
});

/**
 * DELETE /api/admin/api-keys/:id
 * Revoga uma chave de API permanentemente.
 */
adminRoutes.delete("/api-keys/:id", async (c) => {
  const db = c.get("db");
  const keyId = c.req.param("id");

  const [existing] = await db.select().from(schema.apiKey).where(eq(schema.apiKey.id, keyId)).limit(1);
  if (!existing) {
    return c.json({ error: "NotFound", message: "Chave de API não encontrada" }, 404);
  }

  await db
    .update(schema.apiKey)
    .set({ revokedAt: new Date() })
    .where(eq(schema.apiKey.id, keyId));

  await logAuditEvent(db, {
    action: "api_key.revoked",
    actorId: c.get("userId"),
    targetId: keyId,
    targetType: "api_key",
    metadata: { name: existing.name, displayKey: existing.displayKey },
  });

  return c.json({ success: true, message: "Chave de API revogada com sucesso" });
});

/**
 * ============================================================================
 * AUDIT LOGS (Trilha de Auditoria & Segurança)
 * ============================================================================
 */

/**
 * GET /api/admin/audit-logs
 * Consulta a trilha de eventos de auditoria com paginação e busca.
 */
adminRoutes.get("/audit-logs", async (c) => {
  const db = c.get("db");
  const limit = Math.min(Number(c.req.query("limit") || 50), 100);
  const search = c.req.query("search")?.toLowerCase();

  const logs = await db
    .select()
    .from(schema.auditLog)
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limit);

  const filtered = search
    ? logs.filter(
        (l) =>
          l.action.toLowerCase().includes(search) ||
          (l.actorEmail && l.actorEmail.toLowerCase().includes(search)) ||
          (l.targetId && l.targetId.toLowerCase().includes(search))
      )
    : logs;

  return c.json({
    logs: filtered,
    total: filtered.length,
  });
});

/**
 * ============================================================================
 * WEBHOOKS MANAGEMENT & TEST PING
 * ============================================================================
 */

/**
 * GET /api/admin/webhooks/info
 * Retorna status da configuração de webhooks na instância.
 */
adminRoutes.get("/webhooks/info", (c) => {
  const env = c.env;
  return c.json({
    configured: Boolean(env?.WEBHOOK_URL),
    url: env?.WEBHOOK_URL || null,
    hasSecret: Boolean(env?.WEBHOOK_SECRET),
  });
});

/**
 * POST /api/admin/webhooks/test
 * Dispara um ping sintético de teste com assinatura HMAC-SHA256 para validar o receptor externo.
 */
adminRoutes.post("/webhooks/test", async (c) => {
  const env = c.env;
  const db = c.get("db");

  if (!env?.WEBHOOK_URL) {
    return c.json(
      {
        error: "BadRequest",
        message: "Nenhuma WEBHOOK_URL configurada nas variáveis de ambiente (.env / wrangler.jsonc)",
      },
      400
    );
  }

  const start = Date.now();
  let status = 0;
  let success = false;
  let errorMsg: string | null = null;

  try {
    const payloadStr = JSON.stringify({
      id: `evt_${crypto.randomUUID()}`,
      event: "test.ping",
      createdAt: Date.now(),
      data: {
        message: "Ping de teste sintético enviado pelo Edgekit Auth Console",
        timestamp: new Date().toISOString(),
      },
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Edgekit-Auth-Webhooks/1.0",
    };

    if (env.WEBHOOK_SECRET) {
      headers["X-Edgekit-Signature"] = await signWebhookPayload(env.WEBHOOK_SECRET, payloadStr);
    }

    const res = await fetch(env.WEBHOOK_URL, {
      method: "POST",
      headers,
      body: payloadStr,
    });

    status = res.status;
    success = res.ok;
  } catch (err: any) {
    errorMsg = err.message || "Falha ao conectar com o servidor webhook";
  }

  const latencyMs = Date.now() - start;

  await logAuditEvent(db, {
    action: "webhook.test_ping",
    actorId: c.get("userId"),
    targetType: "webhook",
    metadata: {
      url: env.WEBHOOK_URL,
      status,
      success,
      latencyMs,
      error: errorMsg,
    },
  });

  return c.json({
    success,
    status,
    latencyMs,
    error: errorMsg,
  });
});
