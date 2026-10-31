import { describe, it, expect, beforeEach } from "vitest";
import app from "@/index";
import { createMockD1 } from "../helpers/mock-d1";
import type { Bindings } from "@/types/env";
import * as schema from "@/db/schema";
import { createDb } from "@/db";

describe("Rate Limiting & Concurrency Stress Integration Tests", () => {
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

  describe("Rate Limiting Engine", () => {
    it("should enforce rate limit threshold and return 429 when max requests exceeded", async () => {
      const rateLimitedEnv: Bindings = {
        ...mockEnv,
        RATE_LIMIT_ENABLED: "true",
        RATE_LIMIT_MAX: "5",
        RATE_LIMIT_WINDOW: "60",
      };

      const testIp = "203.0.113.42";
      const responses: Response[] = [];

      // Send 5 rapid requests from the same IP (up to the limit)
      for (let i = 0; i < 5; i++) {
        const res = await app.request(
          "/api/auth/sign-in/email",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-forwarded-for": testIp,
              "cf-connecting-ip": testIp,
            },
            body: JSON.stringify({
              email: `stress_${i}@example.com`,
              password: "WrongPassword123!",
            }),
          },
          rateLimitedEnv
        );
        responses.push(res);
      }

      // The first 5 requests should reach Better Auth (and fail with 400/401 invalid credentials, not 429)
      for (const res of responses) {
        expect(res.status).not.toBe(429);
      }

      // 6th request from the same IP exceeds limit -> Must be rejected with 429 Too Many Requests
      const blockedRes = await app.request(
        "/api/auth/sign-in/email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": testIp,
            "cf-connecting-ip": testIp,
          },
          body: JSON.stringify({
            email: "stress_blocked@example.com",
            password: "WrongPassword123!",
          }),
        },
        rateLimitedEnv
      );

      expect(blockedRes.status).toBe(429);
    });

    it("should maintain IP isolation: rate-limiting one IP does not affect another IP", async () => {
      const rateLimitedEnv: Bindings = {
        ...mockEnv,
        RATE_LIMIT_ENABLED: "true",
        RATE_LIMIT_MAX: "3",
        RATE_LIMIT_WINDOW: "60",
      };

      const abusiveIp = "198.51.100.10";
      const legitimateIp = "198.51.100.20";

      // Exhaust quota for abusive IP
      for (let i = 0; i < 3; i++) {
        await app.request(
          "/api/auth/sign-in/email",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-forwarded-for": abusiveIp,
              "cf-connecting-ip": abusiveIp,
            },
            body: JSON.stringify({
              email: "abuse@example.com",
              password: "WrongPassword123!",
            }),
          },
          rateLimitedEnv
        );
      }

      // Verify abusive IP is now 429 blocked
      const abusiveCheck = await app.request(
        "/api/auth/sign-in/email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": abusiveIp,
            "cf-connecting-ip": abusiveIp,
          },
          body: JSON.stringify({
            email: "abuse@example.com",
            password: "WrongPassword123!",
          }),
        },
        rateLimitedEnv
      );
      expect(abusiveCheck.status).toBe(429);

      // Legitimate IP should NOT be blocked (has its own quota)
      const legitimateRes = await app.request(
        "/api/auth/sign-in/email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": legitimateIp,
            "cf-connecting-ip": legitimateIp,
          },
          body: JSON.stringify({
            email: "legit@example.com",
            password: "WrongPassword123!",
          }),
        },
        rateLimitedEnv
      );

      expect(legitimateRes.status).not.toBe(429);
    });
  });

  describe("Concurrency & Race Condition Resiliência", () => {
    it("should handle simultaneous registration race condition: exactly 1 succeeds, DB stays consistent", async () => {
      const targetEmail = "race_condition_user@example.com";
      const concurrentAttempts = 10;

      // Fire 10 simultaneous sign-up attempts with the exact same email
      const promises = Array.from({ length: concurrentAttempts }).map((_, idx) =>
        app.request(
          "/api/auth/sign-up/email",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-forwarded-for": `10.0.0.${idx + 1}`,
              "cf-connecting-ip": `10.0.0.${idx + 1}`,
            },
            body: JSON.stringify({
              name: `Race User ${idx}`,
              email: targetEmail,
              password: "Password123456!",
            }),
          },
          mockEnv
        )
      );

      const results = await Promise.all(promises);

      // Exactly 1 request should have succeeded (200), all others rejected (e.g. 400 / 422 user already exists)
      const successCount = results.filter((r) => r.status === 200).length;
      const rejectedCount = results.filter((r) => r.status !== 200).length;

      expect(successCount).toBe(1);
      expect(rejectedCount).toBe(concurrentAttempts - 1);

      // Confirm in D1 database that exactly 1 user record exists
      const db = createDb(mockEnv.DB);
      const userRecords = await db.select().from(schema.user);
      const matchingUsers = userRecords.filter((u) => u.email === targetEmail);
      expect(matchingUsers.length).toBe(1);
    });

    it("should handle 20 concurrent M2M API Key authenticated requests simultaneously without SQLite lockups", async () => {
      // 1. Create an admin API key directly in D1
      const db = createDb(mockEnv.DB);
      const { generateApiKey } = await import("@/lib/api-keys");
      const { rawKey, keyHash, displayKey } = await generateApiKey("ek_live");

      await db.insert(schema.apiKey).values({
        id: "key_stress_test_1",
        name: "Stress Test M2M Key",
        prefix: "ek_live",
        keyHash,
        displayKey,
        role: "admin",
        createdAt: new Date(),
      });

      // 2. Fire 20 concurrent requests to /api/admin/stats using the API key
      const concurrentRequests = 20;
      const promises = Array.from({ length: concurrentRequests }).map(() =>
        app.request(
          "/api/admin/stats",
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${rawKey}`,
            },
          },
          mockEnv
        )
      );

      const results = await Promise.all(promises);

      // All 20 requests must return 200 OK
      for (const res of results) {
        expect(res.status).toBe(200);
        const data = (await res.json()) as any;
        expect(data.totalUsers).toBeDefined();
        expect(data.activeApiKeys).toBeGreaterThanOrEqual(1);
      }
    });

    it("should handle concurrent session revocations cleanly", async () => {
      // 1. Create user and multiple sessions
      const userSignup = await app.request(
        "/api/auth/sign-up/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Multi-Session User",
            email: "multisession@example.com",
            password: "StrongPassword123!",
          }),
        },
        mockEnv
      );
      expect(userSignup.status).toBe(200);

      // Login 3 times to create 3 distinct sessions
      const sessionCookies: string[] = [];
      for (let i = 0; i < 3; i++) {
        const loginRes = await app.request(
          "/api/auth/sign-in/email",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: "multisession@example.com",
              password: "StrongPassword123!",
            }),
          },
          mockEnv
        );
        expect(loginRes.status).toBe(200);
        const cookie = loginRes.headers.get("set-cookie") || "";
        sessionCookies.push(cookie);
      }

      // Verify sessions exist in D1
      const db = createDb(mockEnv.DB);
      const userSessions = await db.select().from(schema.session);
      expect(userSessions.length).toBeGreaterThanOrEqual(3);

      // Fire concurrent requests to revoke other sessions from one active session
      const revokePromises = sessionCookies.map((cookie) =>
        app.request(
          "/api/auth/revoke-other-sessions",
          {
            method: "POST",
            headers: {
              cookie,
            },
          },
          mockEnv
        )
      );

      const revokeResults = await Promise.all(revokePromises);
      for (const r of revokeResults) {
        expect([200, 400, 401]).toContain(r.status);
      }
    });
  });
});
