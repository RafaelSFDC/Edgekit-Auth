import { describe, it, expect, beforeEach } from "vitest";
import app from "@/index";
import { createMockD1 } from "../helpers/mock-d1";
import type { Bindings } from "@/types/env";
import { verifyPublishableKey } from "@/lib/api-keys";
import { createDb } from "@/db";

describe("Dual-Key Architecture (Publishable vs Secret Keys) Integration Tests", () => {
  let mockEnv: Bindings;
  let adminCookie: string;

  beforeEach(async () => {
    mockEnv = {
      DB: createMockD1(),
      BETTER_AUTH_SECRET: "test-secret-must-be-at-least-32-chars-long!",
      BETTER_AUTH_URL: "http://localhost:8787",
      ENVIRONMENT: "test",
      RATE_LIMIT_ENABLED: "false",
    };

    // Initialize root admin
    const setupRes = await app.request(
      "/api/setup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Admin Owner",
          email: "owner@edgekit.dev",
          password: "SuperAdminPass123!",
        }),
      },
      mockEnv
    );
    adminCookie = setupRes.headers.get("set-cookie") || "";
  });

  it("should generate a Publishable Key (pk_live_...) with domain whitelisting and verify allowed origins", async () => {
    const res = await app.request(
      "/api/admin/api-keys",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          name: "My Next.js Frontend",
          prefix: "pk_live",
          allowedOrigins: ["https://myapp.com", "http://localhost:3000"],
        }),
      },
      mockEnv
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.apiKey.prefix).toBe("pk_live");
    expect(body.apiKey.keyType).toBe("publishable");
    expect(body.apiKey.environment).toBe("live");
    expect(body.apiKey.rawKey).toMatch(/^pk_live_/);
    expect(body.apiKey.allowedOrigins).toEqual(["https://myapp.com", "http://localhost:3000"]);

    const db = createDb(mockEnv.DB);

    // Verify allowed origin
    const validCheck = await verifyPublishableKey(db, body.apiKey.rawKey, "https://myapp.com");
    expect(validCheck.valid).toBe(true);

    // Verify disallowed origin
    const invalidCheck = await verifyPublishableKey(db, body.apiKey.rawKey, "https://malicious-site.com");
    expect(invalidCheck.valid).toBe(false);
    expect(invalidCheck.error).toContain("Origin 'https://malicious-site.com' not allowed");
  });

  it("a Publishable Key must NOT be allowed to access admin management routes", async () => {
    const createRes = await app.request(
      "/api/admin/api-keys",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          name: "Client App Key",
          prefix: "pk_test",
        }),
      },
      mockEnv
    );

    const { apiKey } = (await createRes.json()) as any;

    // Attempt to access admin routes using publishable key
    const adminRes = await app.request(
      "/api/admin/stats",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey.rawKey}`,
        },
      },
      mockEnv
    );

    expect(adminRes.status).toBe(403);
  });

  it("a Secret Key (sk_live_...) must successfully authenticate admin routes without cookies", async () => {
    const createRes = await app.request(
      "/api/admin/api-keys",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          name: "Backend Microservice Key",
          prefix: "sk_live",
          role: "admin",
        }),
      },
      mockEnv
    );

    const { apiKey } = (await createRes.json()) as any;
    expect(apiKey.prefix).toBe("sk_live");
    expect(apiKey.keyType).toBe("secret");

    // Access admin route using Secret Key
    const statsRes = await app.request(
      "/api/admin/stats",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey.rawKey}`,
        },
      },
      mockEnv
    );

    expect(statsRes.status).toBe(200);
    const data = (await statsRes.json()) as any;
    expect(data.totalAdmins).toBeGreaterThanOrEqual(1);
  });
});
