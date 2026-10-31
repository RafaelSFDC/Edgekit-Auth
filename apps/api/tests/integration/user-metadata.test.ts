import { describe, it, expect, beforeEach } from "vitest";
import app from "@/index";
import { createMockD1 } from "../helpers/mock-d1";
import type { Bindings } from "@/types/env";

describe("User 3-Tier Metadata (Public, Private, Unsafe) Integration Tests", () => {
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

    const setupRes = await app.request(
      "/api/setup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Super Admin",
          email: "admin@edgekit.dev",
          password: "SuperAdminPass123!",
        }),
      },
      mockEnv
    );
    adminCookie = setupRes.headers.get("set-cookie") || "";
  });

  it("admin can read and update publicMetadata, privateMetadata, and unsafeMetadata", async () => {
    // 1. Create a consumer user
    const createRes = await app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Meta User",
          email: "metauser@client.com",
          password: "SecurePassword123!",
          unsafeMetadata: JSON.stringify({ theme: "dark", onboardingStep: 2 }),
        }),
      },
      mockEnv
    );

    const user = ((await createRes.json()) as any).user;
    expect(user.id).toBeDefined();

    // 2. Fetch metadata via admin API
    const metaRes = await app.request(
      `/api/admin/users/${user.id}/metadata`,
      {
        method: "GET",
        headers: { cookie: adminCookie },
      },
      mockEnv
    );

    expect(metaRes.status).toBe(200);
    const metaData = (await metaRes.json()) as any;
    expect(metaData.userId).toBe(user.id);
    expect(metaData.isSuperAdmin).toBe(false);

    // 3. Update public and private metadata as Super-Admin
    const patchRes = await app.request(
      `/api/admin/users/${user.id}/metadata`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          publicMetadata: { plan: "pro", role: "moderator" },
          privateMetadata: { stripeCustomerId: "cus_123456789", riskScore: 0 },
        }),
      },
      mockEnv
    );

    expect(patchRes.status).toBe(200);

    // 4. Verify updated metadata
    const recheckRes = await app.request(
      `/api/admin/users/${user.id}/metadata`,
      {
        method: "GET",
        headers: { cookie: adminCookie },
      },
      mockEnv
    );

    const updated = (await recheckRes.json()) as any;
    expect(updated.publicMetadata.plan).toBe("pro");
    expect(updated.publicMetadata.role).toBe("moderator");
    expect(updated.privateMetadata.stripeCustomerId).toBe("cus_123456789");
  });
});
