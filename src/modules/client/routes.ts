import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import type { AppContext } from "@/types/env";
import { users, sessions, identities } from "@/db/schema";
import { AuthService } from "@/services/auth.service";
import { OrgService } from "@/services/org.service";
import { clientAuth } from "@/middlewares/client-auth";

export const clientRoutes = new Hono<AppContext>();

/**
 * Handshake endpoint: Called on frontend app startup to get initial auth state.
 */
clientRoutes.get("/v1/client/handshake", clientAuth({ optional: true }), async (c) => {
  const userId = c.get("userId");
  const sessionId = c.get("sessionId");

  if (!userId || !sessionId) {
    return c.json({
      user: null,
      session: null,
      identities: [],
      organizations: [],
    });
  }

  const db = c.get("db");

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!user || !session || session.status !== "active") {
    return c.json({
      user: null,
      session: null,
      identities: [],
      organizations: [],
    });
  }

  const userIdentities = await db
    .select()
    .from(identities)
    .where(eq(identities.userId, userId));

  const orgs = await OrgService.getUserOrganizations(db, userId);

  return c.json({
    user,
    session,
    identities: userIdentities,
    organizations: orgs,
  });
});

/**
 * Refresh session JWT and rotate refresh token.
 */
clientRoutes.post("/v1/client/sessions/:id/touch", async (c) => {
  const sessionId = c.req.param("id");
  let rawRefreshToken: string | undefined;

  // 1. Try reading from cookie (__refresh format: "sessionId:rawRefreshToken")
  const refreshCookie = getCookie(c, "__refresh");
  if (refreshCookie) {
    const [cSessionId, cToken] = refreshCookie.split(":");
    if (cSessionId === sessionId) {
      rawRefreshToken = cToken;
    }
  }

  // 2. Try JSON body fallback
  if (!rawRefreshToken) {
    try {
      const body = await c.req.json<{ refreshToken?: string }>();
      rawRefreshToken = body?.refreshToken;
    } catch {
      // Body not JSON or empty
    }
  }

  if (!rawRefreshToken) {
    throw new HTTPException(400, {
      message: "Missing refresh token in cookie or request body",
    });
  }

  const jwtConfig = {
    issuer: c.env.JWT_ISSUER,
    audience: c.env.JWT_AUDIENCE,
    publicKeyPem: c.env.JWT_PUBLIC_KEY_PEM,
    privateKeyPem: c.env.JWT_PRIVATE_KEY_PEM,
  };

  const isSecure = c.env.ENVIRONMENT !== "development";

  const result = await AuthService.refreshSession(
    c.get("db"),
    sessionId,
    rawRefreshToken,
    jwtConfig
  );

  // Update cookies
  setCookie(c, "__session", result.token, {
    maxAge: 300,
    path: "/",
    httpOnly: true,
    secure: isSecure,
    sameSite: "Lax",
  });

  setCookie(c, "__refresh", `${sessionId}:${result.newRefreshToken}`, {
    maxAge: 30 * 86400,
    path: "/",
    httpOnly: true,
    secure: isSecure,
    sameSite: "Lax",
  });

  return c.json({
    token: result.token,
    refreshToken: result.newRefreshToken,
  });
});

/**
 * Remove/Revoke a session (Logout).
 */
clientRoutes.post("/v1/client/sessions/:id/remove", async (c) => {
  const sessionId = c.req.param("id");
  await AuthService.revokeSession(c.get("db"), sessionId);

  deleteCookie(c, "__session", { path: "/" });
  deleteCookie(c, "__refresh", { path: "/" });

  return c.json({
    id: sessionId,
    status: "revoked",
  });
});

/**
 * Get current authenticated user details.
 */
clientRoutes.get("/v1/client/users/me", clientAuth(), async (c) => {
  const userId = c.get("userId")!;
  const db = c.get("db");

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }

  const userIdentities = await db
    .select()
    .from(identities)
    .where(eq(identities.userId, userId));

  const orgs = await OrgService.getUserOrganizations(db, userId);

  return c.json({
    user,
    identities: userIdentities,
    organizations: orgs,
  });
});

/**
 * Update current user profile.
 */
clientRoutes.patch("/v1/client/users/me", clientAuth(), async (c) => {
  const userId = c.get("userId")!;
  const db = c.get("db");

  const body = await c.req.json<{
    firstName?: string;
    lastName?: string;
    imageUrl?: string;
    publicMetadata?: Record<string, unknown>;
  }>();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }

  const [updatedUser] = await db
    .update(users)
    .set({
      firstName: body.firstName !== undefined ? body.firstName : user.firstName,
      lastName: body.lastName !== undefined ? body.lastName : user.lastName,
      imageUrl: body.imageUrl !== undefined ? body.imageUrl : user.imageUrl,
      publicMetadata: body.publicMetadata !== undefined ? body.publicMetadata : user.publicMetadata,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  return c.json(updatedUser);
});
