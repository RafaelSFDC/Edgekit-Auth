import { describe, it, expect, beforeEach } from "vitest";
import app from "@/index";
import { createMockD1 } from "../helpers/mock-d1";
import type { Bindings } from "@/types/env";

describe("Super-Admin Isolation & Consumer Protection Integration Tests", () => {
  let mockEnv: Bindings;

  beforeEach(() => {
    mockEnv = {
      DB: createMockD1(),
      BETTER_AUTH_SECRET: "test-secret-must-be-at-least-32-chars-long!",
      BETTER_AUTH_URL: "http://localhost:8787",
      ENVIRONMENT: "test",
      RATE_LIMIT_ENABLED: "false",
    };
  });

  it("consumer users should have role 'user' and isSuperAdmin false by default", async () => {
    // 1. Consumer user signs up via public API
    const signUpRes = await app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Consumer Dev",
          email: "consumer@clientapp.com",
          password: "ConsumerPassword123!",
        }),
      },
      mockEnv
    );

    expect(signUpRes.status).toBe(200);
    const body = (await signUpRes.json()) as any;
    expect(body.user).toBeDefined();
    expect(body.user.role).toBe("user");
    expect(body.user.isSuperAdmin).toBe(false);
  });

  it("consumer users must be rejected (403 Forbidden) from accessing Edgekit Admin Console routes", async () => {
    // 1. Consumer user signs up and gets session cookies
    const signUpRes = await app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "End User",
          email: "consumer2@clientapp.com",
          password: "ConsumerPassword123!",
        }),
      },
      mockEnv
    );

    const setCookies = signUpRes.headers.get("set-cookie") || "";

    // 2. Consumer attempts to access super-admin protected routes
    const adminRes = await app.request(
      "/api/admin/stats",
      {
        method: "GET",
        headers: {
          cookie: setCookies,
        },
      },
      mockEnv
    );

    expect(adminRes.status).toBe(403);
    const errBody = (await adminRes.json()) as any;
    expect(errBody.error).toBe("Unauthorized");
    expect(errBody.message).toContain("super-administrador");
  });

  it("super-admin created via /api/setup can successfully access admin routes", async () => {
    // 1. Setup first root admin
    const setupRes = await app.request(
      "/api/setup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Root Super Admin",
          email: "superadmin@edgekit.dev",
          password: "SuperAdminPass123!",
        }),
      },
      mockEnv
    );

    expect(setupRes.status).toBe(201);
    const setCookies = setupRes.headers.get("set-cookie") || "";

    // 2. Super admin accesses /api/admin/stats
    const statsRes = await app.request(
      "/api/admin/stats",
      {
        method: "GET",
        headers: {
          cookie: setCookies,
        },
      },
      mockEnv
    );

    expect(statsRes.status).toBe(200);
    const stats = (await statsRes.json()) as any;
    expect(stats.totalAdmins).toBe(1);
  });
});
