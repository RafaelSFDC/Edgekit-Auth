import { describe, it, expect, beforeEach } from "vitest";
import app from "@/index";
import { createMockD1 } from "../helpers/mock-d1";
import type { Bindings } from "@/types/env";
import * as schema from "@/db/schema";
import { createDb } from "@/db";
import { eq } from "drizzle-orm";

describe("First-Access Setup & Bootstrapping Integration Tests", () => {
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

  it("should report needsSetup: true when database has no admin users", async () => {
    const res = await app.request("/api/setup/status", {}, mockEnv);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.initialized).toBe(false);
    expect(data.needsSetup).toBe(true);
  });

  it("should reject invalid setup requests with 400", async () => {
    // Password too short
    const resShortPass = await app.request(
      "/api/setup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Admin",
          email: "admin@test.com",
          password: "short",
        }),
      },
      mockEnv
    );
    expect(resShortPass.status).toBe(400);

    // Invalid email
    const resBadEmail = await app.request(
      "/api/setup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Admin",
          email: "not-an-email",
          password: "LongEnoughPassword123!",
        }),
      },
      mockEnv
    );
    expect(resBadEmail.status).toBe(400);
  });

  it("should allow creating the initial administrator on first access and initialize the system", async () => {
    const setupRes = await app.request(
      "/api/setup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Root Administrator",
          email: "admin@empresa.com",
          password: "SuperSecretPassword123!",
        }),
      },
      mockEnv
    );

    expect(setupRes.status).toBe(201);
    const setupData = (await setupRes.json()) as any;
    expect(setupData.success).toBe(true);
    expect(setupData.user.role).toBe("super_admin");
    expect(setupData.user.isSuperAdmin).toBe(true);
    expect(setupData.user.email).toBe("admin@empresa.com");

    // Verify in D1 database that user exists and has role 'super_admin' and emailVerified = true
    const db = createDb(mockEnv.DB);
    const [userRecord] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, "admin@empresa.com"));

    expect(userRecord).toBeDefined();
    expect(userRecord.role).toBe("super_admin");
    expect(Boolean(userRecord.isSuperAdmin)).toBe(true);
    expect(userRecord.emailVerified).toBe(true);

    // Verify audit log has system.bootstrapped entry
    const auditLogs = await db.select().from(schema.auditLog);
    const bootstrapLog = auditLogs.find((l) => l.action === "system.bootstrapped");
    expect(bootstrapLog).toBeDefined();
    expect(bootstrapLog?.actorEmail).toBe("admin@empresa.com");

    // Verify setup status now reports needsSetup: false, initialized: true
    const statusRes = await app.request("/api/setup/status", {}, mockEnv);
    const statusData = (await statusRes.json()) as any;
    expect(statusData.initialized).toBe(true);
    expect(statusData.needsSetup).toBe(false);

    // Verify any subsequent call to POST /api/setup is blocked permanently with 403 Forbidden
    const secondSetupRes = await app.request(
      "/api/setup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Attacker Trying Second Admin",
          email: "attacker@evil.com",
          password: "AttackerPassword123!",
        }),
      },
      mockEnv
    );

    expect(secondSetupRes.status).toBe(403);
    const secondData = (await secondSetupRes.json()) as any;
    expect(secondData.error).toBe("Forbidden");
    expect(secondData.message).toContain("já foi inicializado");
  });
});
