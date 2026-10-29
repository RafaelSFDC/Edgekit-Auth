import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { AppContext } from "@/types/env";
import { users, sessions, identities, organizations } from "@/db/schema";
import { adminAuth } from "@/middlewares/admin-auth";
import { AuthService } from "@/services/auth.service";
import { OrgService } from "@/services/org.service";
import { generateId } from "@/lib/id";

export const backendRoutes = new Hono<AppContext>();

// Require Secret Key for all backend API endpoints
backendRoutes.use("/v1/backend/*", adminAuth());

/**
 * List users
 */
backendRoutes.get("/v1/backend/users", async (c) => {
  const db = c.get("db");
  const limit = Math.min(Number(c.req.query("limit") || 50), 100);
  const offset = Number(c.req.query("offset") || 0);

  const list = await db
    .select()
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({ data: list, limit, offset });
});

/**
 * Get user by ID
 */
backendRoutes.get("/v1/backend/users/:id", async (c) => {
  const db = c.get("db");
  const userId = c.req.param("id");

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }

  const userIdts = await db
    .select()
    .from(identities)
    .where(eq(identities.userId, userId));

  const userSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.createdAt));

  return c.json({
    user,
    identities: userIdts,
    sessions: userSessions,
  });
});

/**
 * Create a user manually
 */
backendRoutes.post("/v1/backend/users", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<{
    email?: string;
    firstName?: string;
    lastName?: string;
    publicMetadata?: Record<string, unknown>;
  }>();

  const userId = generateId("user");
  const [created] = await db
    .insert(users)
    .values({
      id: userId,
      primaryEmail: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      publicMetadata: body.publicMetadata || {},
      banned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return c.json(created, 201);
});

/**
 * Ban a user (suspends account and revokes all active sessions)
 */
backendRoutes.post("/v1/backend/users/:id/ban", async (c) => {
  const db = c.get("db");
  const userId = c.req.param("id");

  const [updated] = await db
    .update(users)
    .set({ banned: true, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) {
    throw new HTTPException(404, { message: "User not found" });
  }

  await AuthService.revokeAllUserSessions(db, userId);

  return c.json({ user: updated, status: "banned" });
});

/**
 * Unban a user
 */
backendRoutes.post("/v1/backend/users/:id/unban", async (c) => {
  const db = c.get("db");
  const userId = c.req.param("id");

  const [updated] = await db
    .update(users)
    .set({ banned: false, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) {
    throw new HTTPException(404, { message: "User not found" });
  }

  return c.json({ user: updated, status: "active" });
});

/**
 * Delete a user
 */
backendRoutes.delete("/v1/backend/users/:id", async (c) => {
  const db = c.get("db");
  const userId = c.req.param("id");

  await db.delete(users).where(eq(users.id, userId));

  return c.json({ id: userId, deleted: true });
});

/**
 * Revoke session
 */
backendRoutes.post("/v1/backend/sessions/:id/revoke", async (c) => {
  const db = c.get("db");
  const sessionId = c.req.param("id");

  await AuthService.revokeSession(db, sessionId);

  return c.json({ id: sessionId, status: "revoked" });
});

/**
 * List organizations
 */
backendRoutes.get("/v1/backend/organizations", async (c) => {
  const db = c.get("db");
  const list = await db.select().from(organizations).orderBy(desc(organizations.createdAt));
  return c.json({ data: list });
});

/**
 * Create organization
 */
backendRoutes.post("/v1/backend/organizations", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<{
    name: string;
    slug: string;
    createdBy: string;
    logoUrl?: string;
  }>();

  if (!body.name || !body.slug || !body.createdBy) {
    throw new HTTPException(400, {
      message: "Missing required fields: name, slug, createdBy",
    });
  }

  const result = await OrgService.createOrganization(db, body.createdBy, {
    name: body.name,
    slug: body.slug,
    logoUrl: body.logoUrl,
  });

  return c.json(result, 201);
});
