import { eq, and } from "drizzle-orm";
import type { Database } from "@/db";
import { users, identities, sessions } from "@/db/schema";
import type { NormalizedProfile } from "@/lib/oauth";
import { generateId } from "@/lib/id";
import { generateRandomString, sha256 } from "@/lib/crypto";
import { signSessionToken, type KeyPairConfig } from "@/lib/jwt";

export interface SessionResult {
  user: typeof users.$inferSelect;
  session: typeof sessions.$inferSelect;
  token: string;
  refreshToken: string;
}

export class AuthService {
  /**
   * Process OAuth user profile: link account or create new user, and start session.
   */
  static async handleOAuthLogin(
    db: Database,
    profile: NormalizedProfile,
    clientInfo: { userAgent?: string; ipAddress?: string },
    jwtConfig?: KeyPairConfig
  ): Promise<SessionResult> {
    // 1. Check if identity already exists
    const [existingIdentity] = await db
      .select()
      .from(identities)
      .where(
        and(
          eq(identities.provider, profile.provider),
          eq(identities.providerUserId, profile.providerUserId)
        )
      )
      .limit(1);

    let user: typeof users.$inferSelect;

    if (existingIdentity) {
      // User identity found
      const [foundUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, existingIdentity.userId))
        .limit(1);

      if (!foundUser) {
        throw new Error("User record missing for linked identity");
      }

      if (foundUser.banned) {
        throw new Error("User account is suspended");
      }

      user = foundUser;

      // Update profile info if changed
      await db
        .update(users)
        .set({
          firstName: user.firstName ?? profile.firstName,
          lastName: user.lastName ?? profile.lastName,
          imageUrl: user.imageUrl ?? profile.imageUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    } else {
      // 2. Check if user with same verified email already exists (Account Linking)
      let matchedUser: typeof users.$inferSelect | undefined;

      if (profile.email) {
        const [foundByEmail] = await db
          .select()
          .from(users)
          .where(eq(users.primaryEmail, profile.email))
          .limit(1);
        matchedUser = foundByEmail;
      }

      if (matchedUser) {
        user = matchedUser;
      } else {
        // Create new user
        const newUserId = generateId("user");
        const [createdUser] = await db
          .insert(users)
          .values({
            id: newUserId,
            primaryEmail: profile.email,
            firstName: profile.firstName,
            lastName: profile.lastName,
            imageUrl: profile.imageUrl,
            banned: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
        user = createdUser;
      }

      // Link identity to user
      const identityId = generateId("idn");
      await db.insert(identities).values({
        id: identityId,
        userId: user.id,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        email: profile.email,
        profileData: profile.raw,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // 3. Create active session
    const sessionId = generateId("sess");
    const rawRefreshToken = generateRandomString(48);
    const refreshTokenHash = await sha256(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const [session] = await db
      .insert(sessions)
      .values({
        id: sessionId,
        userId: user.id,
        status: "active",
        refreshTokenHash,
        userAgent: clientInfo.userAgent,
        ipAddress: clientInfo.ipAddress,
        lastActiveAt: new Date(),
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // 4. Issue short-lived JWT (5 minutes)
    const token = await signSessionToken(
      {
        sub: user.id,
        sid: session.id,
        email: user.primaryEmail ?? undefined,
      },
      jwtConfig,
      "5m"
    );

    return { user, session, token, refreshToken: rawRefreshToken };
  }

  /**
   * Refreshes a session, rotating the refresh token and issuing a new JWT.
   */
  static async refreshSession(
    db: Database,
    sessionId: string,
    rawRefreshToken: string,
    jwtConfig?: KeyPairConfig
  ): Promise<{ token: string; newRefreshToken: string }> {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session || session.status !== "active") {
      throw new Error("Invalid or inactive session");
    }

    if (new Date() > session.expiresAt) {
      await db
        .update(sessions)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(sessions.id, sessionId));
      throw new Error("Session has expired");
    }

    // Check refresh token hash
    const incomingHash = await sha256(rawRefreshToken);
    if (session.refreshTokenHash !== incomingHash) {
      // Possible token reuse / breach: revoke session immediately!
      await db
        .update(sessions)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(eq(sessions.id, sessionId));
      throw new Error("Invalid refresh token (session revoked for security)");
    }

    // Rotate refresh token
    const newRefreshToken = generateRandomString(48);
    const newHash = await sha256(newRefreshToken);

    await db
      .update(sessions)
      .set({
        refreshTokenHash: newHash,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));

    // Fetch user for claims
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!user || user.banned) {
      throw new Error("User account is unavailable or banned");
    }

    const token = await signSessionToken(
      {
        sub: user.id,
        sid: session.id,
        email: user.primaryEmail ?? undefined,
      },
      jwtConfig,
      "5m"
    );

    return { token, newRefreshToken };
  }

  /**
   * Revoke a single session.
   */
  static async revokeSession(db: Database, sessionId: string): Promise<void> {
    await db
      .update(sessions)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

  /**
   * Revoke all sessions for a user.
   */
  static async revokeAllUserSessions(
    db: Database,
    userId: string
  ): Promise<void> {
    await db
      .update(sessions)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(eq(sessions.userId, userId));
  }
}
