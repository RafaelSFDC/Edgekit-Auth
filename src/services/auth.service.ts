import { eq, and, ne } from "drizzle-orm";
import type { Database } from "@/db";
import { users, identities, sessions, verificationTokens } from "@/db/schema";
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

export interface ClientLocationInfo {
  userAgent?: string;
  ipAddress?: string;
  city?: string | null;
  country?: string | null;
  deviceInfo?: string;
}

export class AuthService {
  /**
   * Process OAuth user profile: link account or create new user, and start session.
   */
  static async handleOAuthLogin(
    db: Database,
    profile: NormalizedProfile,
    clientInfo: ClientLocationInfo,
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

    // Create session with geolocation and device info
    return this.createActiveSession(db, user, clientInfo, jwtConfig);
  }

  /**
   * Process email login (Magic Link or OTP): find or create user and start session.
   */
  static async handleEmailLogin(
    db: Database,
    email: string,
    clientInfo: ClientLocationInfo,
    jwtConfig?: KeyPairConfig
  ): Promise<SessionResult> {
    const cleanEmail = email.trim().toLowerCase();

    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.primaryEmail, cleanEmail))
      .limit(1);

    let user: typeof users.$inferSelect;

    if (existingUser) {
      if (existingUser.banned) {
        throw new Error("User account is suspended");
      }
      user = existingUser;
    } else {
      const newUserId = generateId("user");
      const [createdUser] = await db
        .insert(users)
        .values({
          id: newUserId,
          primaryEmail: cleanEmail,
          banned: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      user = createdUser;

      const identityId = generateId("idn");
      await db.insert(identities).values({
        id: identityId,
        userId: user.id,
        provider: "email",
        providerUserId: cleanEmail,
        email: cleanEmail,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return this.createActiveSession(db, user, clientInfo, jwtConfig);
  }

  /**
   * Creates an active session with device and geolocation data.
   */
  private static async createActiveSession(
    db: Database,
    user: typeof users.$inferSelect,
    clientInfo: ClientLocationInfo,
    jwtConfig?: KeyPairConfig
  ): Promise<SessionResult> {
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
        city: clientInfo.city,
        country: clientInfo.country,
        deviceInfo: clientInfo.deviceInfo,
        lastActiveAt: new Date(),
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

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
   * Generates a 6-digit OTP and Magic Link token for email authentication.
   */
  static async createEmailVerification(
    db: Database,
    email: string
  ): Promise<{ code: string; rawToken: string }> {
    const cleanEmail = email.trim().toLowerCase();

    // 6-digit numeric OTP code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const rawToken = generateRandomString(32);
    const tokenHash = await sha256(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const id = generateId("verif");

    await db.insert(verificationTokens).values({
      id,
      identifier: cleanEmail,
      tokenHash,
      code,
      type: "email_otp",
      expiresAt,
      createdAt: new Date(),
    });

    return { code, rawToken };
  }

  /**
   * Verifies an OTP code for an email.
   */
  static async verifyEmailOtp(
    db: Database,
    email: string,
    code: string
  ): Promise<boolean> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    const [match] = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, cleanEmail),
          eq(verificationTokens.code, cleanCode)
        )
      )
      .limit(1);

    if (!match) {
      return false;
    }

    if (new Date() > match.expiresAt) {
      await db.delete(verificationTokens).where(eq(verificationTokens.id, match.id));
      return false;
    }

    // Single-use: delete once verified
    await db.delete(verificationTokens).where(eq(verificationTokens.id, match.id));
    return true;
  }

  /**
   * Verifies a Magic Link token.
   */
  static async verifyMagicLink(
    db: Database,
    email: string,
    rawToken: string
  ): Promise<boolean> {
    const cleanEmail = email.trim().toLowerCase();
    const tokenHash = await sha256(rawToken.trim());

    const [match] = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, cleanEmail),
          eq(verificationTokens.tokenHash, tokenHash)
        )
      )
      .limit(1);

    if (!match) {
      return false;
    }

    if (new Date() > match.expiresAt) {
      await db.delete(verificationTokens).where(eq(verificationTokens.id, match.id));
      return false;
    }

    await db.delete(verificationTokens).where(eq(verificationTokens.id, match.id));
    return true;
  }

  /**
   * Get all active sessions for a user, indicating the current session.
   */
  static async getUserActiveSessions(
    db: Database,
    userId: string,
    currentSessionId?: string
  ) {
    const list = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.status, "active")));

    return list.map((s) => ({
      ...s,
      isCurrent: s.id === currentSessionId,
    }));
  }

  /**
   * Revoke all other sessions for a user, keeping only the current one active.
   */
  static async revokeOtherSessions(
    db: Database,
    userId: string,
    currentSessionId: string
  ): Promise<void> {
    await db
      .update(sessions)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(
        and(
          eq(sessions.userId, userId),
          ne(sessions.id, currentSessionId),
          eq(sessions.status, "active")
        )
      );
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

    const incomingHash = await sha256(rawRefreshToken);
    if (session.refreshTokenHash !== incomingHash) {
      await db
        .update(sessions)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(eq(sessions.id, sessionId));
      throw new Error("Invalid refresh token (session revoked for security)");
    }

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
