import { describe, it, expect, beforeEach } from "vitest";
import app from "@/index";
import { createMockD1 } from "../helpers/mock-d1";
import type { Bindings } from "@/types/env";

describe("Phase 2: M2M API Keys & Audit Trail Integration Tests", () => {
  let mockEnv: Bindings;
  let adminCookie: string;

  beforeEach(async () => {
    mockEnv = {
      ENVIRONMENT: "development",
      APP_URL: "http://localhost:8787",
      BETTER_AUTH_URL: "http://localhost:8787",
      BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long-123456",
      ADMIN_EMAILS: "admin@empresa.com",
      DB: createMockD1(),
    };

    // 1. Sign up admin user
    const adminSignUp = await app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@empresa.com",
          password: "AdminPassword123!",
          name: "Admin Boss",
        }),
      },
      mockEnv
    );
    expect(adminSignUp.status).toBe(200);
    adminCookie = adminSignUp.headers.get("set-cookie") || "";
  });

  describe("M2M API Keys Lifecycle & Authentication", () => {
    it("admin can create a new M2M API key and use it to authenticate without cookies", async () => {
      // 1. Create API key
      const createRes = await app.request(
        "/api/admin/api-keys",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: adminCookie,
          },
          body: JSON.stringify({
            name: "Backend Billing Service",
            prefix: "ek_live",
            role: "admin",
            expiresInDays: 30,
          }),
        },
        mockEnv
      );

      expect(createRes.status).toBe(200);
      const createData = (await createRes.json()) as any;
      expect(createData.apiKey).toBeDefined();
      expect(createData.apiKey.rawKey).toMatch(/^ek_live_[a-f0-9]{48}$/);
      expect(createData.apiKey.displayKey).toMatch(/^ek_live_/);
      expect(createData.apiKey.name).toBe("Backend Billing Service");

      const rawKey = createData.apiKey.rawKey;

      // 2. Call /api/admin/stats using Authorization: Bearer <rawKey> without Cookie
      const statsRes = await app.request(
        "/api/admin/stats",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${rawKey}`,
          },
        },
        mockEnv
      );

      expect(statsRes.status).toBe(200);
      const statsData = (await statsRes.json()) as any;
      expect(statsData.activeApiKeys).toBe(1);

      // 3. Call using x-api-key header
      const statsRes2 = await app.request(
        "/api/admin/stats",
        {
          method: "GET",
          headers: {
            "x-api-key": rawKey,
          },
        },
        mockEnv
      );
      expect(statsRes2.status).toBe(200);

      // 4. List API Keys
      const listRes = await app.request(
        "/api/admin/api-keys",
        {
          method: "GET",
          headers: { Cookie: adminCookie },
        },
        mockEnv
      );

      expect(listRes.status).toBe(200);
      const listData = (await listRes.json()) as any;
      expect(listData.apiKeys.length).toBe(1);
      expect(listData.apiKeys[0].lastUsedAt).toBeDefined(); // updated by verifyApiKey
      expect(listData.apiKeys[0].keyHash).toBeUndefined(); // never expose raw hash

      // 5. Revoke API Key
      const revokeRes = await app.request(
        `/api/admin/api-keys/${createData.apiKey.id}`,
        {
          method: "DELETE",
          headers: { Cookie: adminCookie },
        },
        mockEnv
      );
      expect(revokeRes.status).toBe(200);

      // 6. Attempt to use revoked API Key -> must be 403
      const revokedUseRes = await app.request(
        "/api/admin/stats",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${rawKey}`,
          },
        },
        mockEnv
      );
      expect(revokedUseRes.status).toBe(403);
    });

    it("invalid or forged API key must return 403", async () => {
      const res = await app.request(
        "/api/admin/stats",
        {
          method: "GET",
          headers: {
            Authorization: "Bearer ek_live_fakefakefakefakefakefakefakefakefakefakefakefake",
          },
        },
        mockEnv
      );
      expect(res.status).toBe(403);
    });
  });

  describe("Audit Trail System", () => {
    it("should log actions and allow admin to query audit trail", async () => {
      // Create user to trigger audit event
      await app.request(
        "/api/auth/sign-up/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "auditoria@empresa.com",
            password: "AuditPassword123!",
            name: "Audit User",
          }),
        },
        mockEnv
      );

      // Create an API key to trigger another audit event
      await app.request(
        "/api/admin/api-keys",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: adminCookie,
          },
          body: JSON.stringify({
            name: "Test Audit Key",
          }),
        },
        mockEnv
      );

      // Query audit logs
      const auditRes = await app.request(
        "/api/admin/audit-logs",
        {
          method: "GET",
          headers: { Cookie: adminCookie },
        },
        mockEnv
      );

      expect(auditRes.status).toBe(200);
      const auditData = (await auditRes.json()) as any;
      expect(auditData.logs).toBeDefined();
      expect(Array.isArray(auditData.logs)).toBe(true);
      expect(auditData.logs.length).toBeGreaterThanOrEqual(2);

      const actions = auditData.logs.map((l: any) => l.action);
      expect(actions).toContain("api_key.created");
      expect(actions).toContain("user.created");
    });
  });

  describe("Strict Email Verification Policy Configuration", () => {
    it("should prevent login when REQUIRE_EMAIL_VERIFICATION is true and email is not verified", async () => {
      const strictEnv: Bindings = {
        ...mockEnv,
        REQUIRE_EMAIL_VERIFICATION: "true",
      };

      // 1. Sign up unverified user
      const signUpRes = await app.request(
        "/api/auth/sign-up/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "nao.verificado@empresa.com",
            password: "SenhaSegura123!",
            name: "Nao Verificado",
          }),
        },
        strictEnv
      );
      expect(signUpRes.status).toBe(200);

      // 2. Attempt sign-in with email & password -> must fail or demand verification
      const signInRes = await app.request(
        "/api/auth/sign-in/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "nao.verificado@empresa.com",
            password: "SenhaSegura123!",
          }),
        },
        strictEnv
      );

      expect(signInRes.status).toBeGreaterThanOrEqual(400);
      const signInBody = (await signInRes.json()) as any;
      expect(signInBody.message?.toLowerCase() || signInBody.error?.toLowerCase() || "").toMatch(/verif/);
    });
  });
});
