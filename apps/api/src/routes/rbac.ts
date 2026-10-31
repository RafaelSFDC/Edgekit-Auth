import { Hono } from "hono";
import type { AppContext } from "@/types/env";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyApiKey } from "@/lib/api-keys";

export const rbacRoutes = new Hono<AppContext>();

/**
 * Super-Admin & Secret Key Guard Middleware
 */
rbacRoutes.use("*", async (c, next) => {
  const auth = c.get("auth");
  const db = c.get("db");

  const authHeader = c.req.header("authorization") || "";
  const xApiKey = c.req.header("x-api-key") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : xApiKey.trim();

  if (token && (token.startsWith("sk_") || token.startsWith("ek_"))) {
    const apiKeyRecord = await verifyApiKey(db, token);
    if (apiKeyRecord && apiKeyRecord.keyType === "secret" && apiKeyRecord.role === "admin") {
      return next();
    }
  }

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const isSuper = Boolean(
    (session?.user as any)?.isSuperAdmin ||
    (session?.user as any)?.role === "super_admin" ||
    (session?.user as any)?.role === "admin"
  );

  if (!session || !isSuper) {
    return c.json({ error: "Unauthorized", message: "Acesso restrito ao Super-Admin" }, 403);
  }

  await next();
});

/**
 * GET /api/admin/rbac/roles
 * List all roles along with their mapped permission keys.
 */
rbacRoutes.get("/roles", async (c) => {
  const db = c.get("db");

  const roles = await db.select().from(schema.role).orderBy(schema.role.createdAt);
  const rolePermissions = await db.select().from(schema.rolePermission);

  const rolesWithPerms = roles.map((r) => {
    const perms = rolePermissions
      .filter((rp) => rp.roleId === r.id)
      .map((rp) => rp.permissionKey);

    return {
      ...r,
      permissions: perms,
    };
  });

  return c.json({ roles: rolesWithPerms });
});

/**
 * POST /api/admin/rbac/roles
 * Create a new custom role.
 */
rbacRoutes.post("/roles", async (c) => {
  const db = c.get("db");
  const body = await c.req.json().catch(() => ({}));

  const key = body.key?.trim()?.toLowerCase();
  const name = body.name?.trim();
  const description = body.description?.trim() || null;
  const scope = body.scope === "organization" ? "organization" : "global";

  if (!key || !name) {
    return c.json({ error: "BadRequest", message: "key e name são obrigatórios" }, 400);
  }

  const id = `role_${key}`;
  const now = new Date();

  await db.insert(schema.role).values({
    id,
    key,
    name,
    description,
    scope,
    isSystem: false,
    createdAt: now,
  });

  if (Array.isArray(body.permissions)) {
    for (const permKey of body.permissions) {
      await db.insert(schema.rolePermission).values({
        id: `rp_${crypto.randomUUID()}`,
        roleId: id,
        permissionKey: permKey,
        createdAt: now,
      });
    }
  }

  return c.json({ success: true, roleId: id });
});

/**
 * DELETE /api/admin/rbac/roles/:id
 */
rbacRoutes.delete("/roles/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  const [existing] = await db.select().from(schema.role).where(eq(schema.role.id, id)).limit(1);
  if (!existing) {
    return c.json({ error: "NotFound", message: "Papel não encontrado" }, 404);
  }

  if (existing.isSystem) {
    return c.json({ error: "Forbidden", message: "Papéis de sistema não podem ser removidos" }, 403);
  }

  await db.delete(schema.rolePermission).where(eq(schema.rolePermission.roleId, id));
  await db.delete(schema.userRole).where(eq(schema.userRole.roleId, id));
  await db.delete(schema.role).where(eq(schema.role.id, id));

  return c.json({ success: true });
});

/**
 * GET /api/admin/rbac/permissions
 */
rbacRoutes.get("/permissions", async (c) => {
  const db = c.get("db");
  const perms = await db.select().from(schema.permission).orderBy(schema.permission.category);
  return c.json({ permissions: perms });
});

/**
 * POST /api/admin/rbac/permissions
 */
rbacRoutes.post("/permissions", async (c) => {
  const db = c.get("db");
  const body = await c.req.json().catch(() => ({}));

  const key = body.key?.trim()?.toLowerCase();
  const name = body.name?.trim();
  const description = body.description?.trim() || null;
  const category = body.category?.trim() || "Geral";

  if (!key || !name) {
    return c.json({ error: "BadRequest", message: "key e name são obrigatórios" }, 400);
  }

  const id = `perm_${key.replace(/[^a-z0-9_]/g, "_")}`;
  const now = new Date();

  await db.insert(schema.permission).values({
    id,
    key,
    name,
    description,
    category,
    createdAt: now,
  });

  return c.json({ success: true, permissionId: id });
});

/**
 * POST /api/admin/rbac/roles/:id/permissions
 * Updates permissions mapped to a role.
 */
rbacRoutes.post("/roles/:id/permissions", async (c) => {
  const db = c.get("db");
  const roleId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const permissions: string[] = body.permissions || [];

  await db.delete(schema.rolePermission).where(eq(schema.rolePermission.roleId, roleId));

  const now = new Date();
  for (const permKey of permissions) {
    await db.insert(schema.rolePermission).values({
      id: `rp_${crypto.randomUUID()}`,
      roleId,
      permissionKey: permKey,
      createdAt: now,
    });
  }

  return c.json({ success: true });
});

/**
 * POST /api/admin/rbac/user-roles
 * Assign a role to a user.
 */
rbacRoutes.post("/user-roles", async (c) => {
  const db = c.get("db");
  const body = await c.req.json().catch(() => ({}));
  const { userId, roleId, organizationId } = body;

  if (!userId || !roleId) {
    return c.json({ error: "BadRequest", message: "userId e roleId são obrigatórios" }, 400);
  }

  const id = `ur_${crypto.randomUUID()}`;
  await db.insert(schema.userRole).values({
    id,
    userId,
    roleId,
    organizationId: organizationId || null,
    createdAt: new Date(),
  });

  return c.json({ success: true, id });
});

/**
 * DELETE /api/admin/rbac/user-roles/:id
 */
rbacRoutes.delete("/user-roles/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  await db.delete(schema.userRole).where(eq(schema.userRole.id, id));
  return c.json({ success: true });
});
