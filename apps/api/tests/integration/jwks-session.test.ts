import { describe, it, expect, beforeEach } from "vitest";
import app from "@/index";
import { createMockD1 } from "../helpers/mock-d1";
import type { Bindings } from "@/types/env";
import * as jose from "jose";

describe("JWKS Offline Verification & Multi-Session Revocation Tests", () => {
  let mockEnv: Bindings;

  beforeEach(() => {
    mockEnv = {
      ENVIRONMENT: "development",
      APP_URL: "http://localhost:8787",
      BETTER_AUTH_URL: "http://localhost:8787",
      BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long-123456",
      DB: createMockD1(),
    };
  });

  describe("JWKS Offline Key Discovery", () => {
    it("should provide well-formatted JWKS keys for third-party backends", async () => {
      const res = await app.request("/.well-known/jwks.json", {}, mockEnv);
      expect(res.status).toBe(200);

      const jwks = (await res.json()) as any;
      expect(jwks).toBeDefined();
      expect(Array.isArray(jwks.keys)).toBe(true);

      if (jwks.keys.length > 0) {
        const key = jwks.keys[0];
        expect(key.kty).toBeDefined();
        // Verify that jose can parse the JWK
        const publicKey = await jose.importJWK(key, key.alg);
        expect(publicKey).toBeDefined();
      }
    });
  });

  describe("Session Revocation Lifecycle", () => {
    it("should allow revoking a specific session and verify it becomes invalid", async () => {
      const userCredentials = {
        email: "multi.session@empresa.com",
        password: "MultiSession123!",
        name: "Multi Session User",
      };

      // 1. Sign up user
      const signUpRes = await app.request(
        "/api/auth/sign-up/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(userCredentials),
        },
        mockEnv
      );
      expect(signUpRes.status).toBe(200);

      // 2. Sign in from Device A
      const sessionARes = await app.request(
        "/api/auth/sign-in/email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Device-A-Browser",
          },
          body: JSON.stringify({
            email: userCredentials.email,
            password: userCredentials.password,
          }),
        },
        mockEnv
      );
      expect(sessionARes.status).toBe(200);
      const cookieA = sessionARes.headers.get("set-cookie") || "";

      // 3. Sign in from Device B
      const sessionBRes = await app.request(
        "/api/auth/sign-in/email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Device-B-Mobile",
          },
          body: JSON.stringify({
            email: userCredentials.email,
            password: userCredentials.password,
          }),
        },
        mockEnv
      );
      expect(sessionBRes.status).toBe(200);
      const sessionBBody = (await sessionBRes.json()) as any;
      const tokenB = sessionBBody.token;
      const cookieB = sessionBRes.headers.get("set-cookie") || "";

      // 4. Verify both sessions are active
      const checkA = await app.request(
        "/api/auth/get-session",
        { headers: { Cookie: cookieA } },
        mockEnv
      );
      expect(checkA.status).toBe(200);
      const activeA = (await checkA.json()) as any;
      expect(activeA?.user?.email).toBe(userCredentials.email);

      const checkB = await app.request(
        "/api/auth/get-session",
        { headers: { Cookie: cookieB } },
        mockEnv
      );
      expect(checkB.status).toBe(200);
      const activeB = (await checkB.json()) as any;
      expect(activeB?.user?.email).toBe(userCredentials.email);

      // 5. From Device A, revoke Device B's session token
      const revokeRes = await app.request(
        "/api/auth/revoke-session",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookieA,
          },
          body: JSON.stringify({ token: tokenB }),
        },
        mockEnv
      );
      expect(revokeRes.status).toBe(200);

      // 6. Device B session should now be null/rejected
      const checkBAfterRevoke = await app.request(
        "/api/auth/get-session",
        { headers: { Cookie: cookieB } },
        mockEnv
      );
      expect(checkBAfterRevoke.status).toBe(200);
      const activeBAfterRevoke = (await checkBAfterRevoke.json()) as any;
      expect(activeBAfterRevoke).toBeNull();

      // 7. Device A session should remain active
      const checkAAfterRevoke = await app.request(
        "/api/auth/get-session",
        { headers: { Cookie: cookieA } },
        mockEnv
      );
      expect(checkAAfterRevoke.status).toBe(200);
      const activeAAfterRevoke = (await checkAAfterRevoke.json()) as any;
      expect(activeAAfterRevoke?.user?.email).toBe(userCredentials.email);
    });

    it("should allow revoking all other sessions", async () => {
      const userCredentials = {
        email: "revoke.others@empresa.com",
        password: "RevokeOthers123!",
        name: "Revoke Others User",
      };

      // 1. Sign up
      await app.request(
        "/api/auth/sign-up/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(userCredentials),
        },
        mockEnv
      );

      // 2. Sign in Device 1
      const res1 = await app.request(
        "/api/auth/sign-in/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: userCredentials.email,
            password: userCredentials.password,
          }),
        },
        mockEnv
      );
      const cookie1 = res1.headers.get("set-cookie") || "";

      // 3. Sign in Device 2
      const res2 = await app.request(
        "/api/auth/sign-in/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: userCredentials.email,
            password: userCredentials.password,
          }),
        },
        mockEnv
      );
      const cookie2 = res2.headers.get("set-cookie") || "";

      // 4. From Device 2, revoke other sessions
      const revokeOthersRes = await app.request(
        "/api/auth/revoke-other-sessions",
        {
          method: "POST",
          headers: { Cookie: cookie2 },
        },
        mockEnv
      );
      expect(revokeOthersRes.status).toBe(200);

      // 5. Device 1 session should now be dead
      const check1 = await app.request(
        "/api/auth/get-session",
        { headers: { Cookie: cookie1 } },
        mockEnv
      );
      expect(check1.status).toBe(200);
      const check1Body = (await check1.json()) as any;
      expect(check1Body).toBeNull();

      // 6. Device 2 session should still be active
      const check2 = await app.request(
        "/api/auth/get-session",
        { headers: { Cookie: cookie2 } },
        mockEnv
      );
      expect(check2.status).toBe(200);
      const check2Body = (await check2.json()) as any;
      expect(check2Body?.user?.email).toBe(userCredentials.email);
    });
  });
});
