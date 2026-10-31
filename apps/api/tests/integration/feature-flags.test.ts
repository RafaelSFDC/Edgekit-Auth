import { describe, it, expect, beforeEach } from "vitest";
import app from "@/index";
import { createMockD1 } from "../helpers/mock-d1";
import type { Bindings } from "@/types/env";
import { createLocalJWKSet, jwtVerify } from "jose";

describe("Modular Feature Flags & Direct Entitlements Integration Tests", () => {
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
          name: "System Admin",
          email: "owner@edgekit.dev",
          password: "SuperSecretPassword123!",
        }),
      },
      mockEnv
    );
    adminCookie = setupRes.headers.get("set-cookie") || "";
  });

  it("should block billing routes when FEATURE_BILLING is set to 'false'", async () => {
    const disabledEnv: Bindings = {
      ...mockEnv,
      FEATURE_BILLING: "false",
    };

    const res = await app.request(
      "/api/billing/plans",
      { method: "GET" },
      disabledEnv
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error).toBe("FeatureDisabled");
    expect(body.message).toContain("Billing");
  });

  it("should block RBAC routes when FEATURE_RBAC is set to 'false'", async () => {
    const disabledEnv: Bindings = {
      ...mockEnv,
      FEATURE_RBAC: "false",
    };

    const res = await app.request(
      "/api/admin/rbac/roles",
      {
        method: "GET",
        headers: { cookie: adminCookie },
      },
      disabledEnv
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error).toBe("FeatureDisabled");
    expect(body.message).toContain("RBAC");
  });

  it("should support direct entitlements and plan assignment without Stripe", async () => {
    // 1. Create consumer user
    const signupRes = await app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Direct Entitlement User",
          email: "entitled@example.com",
          password: "UserPassword123!",
        }),
      },
      mockEnv
    );
    expect(signupRes.status).toBe(200);
    const signupData = (await signupRes.json()) as any;
    const userId = signupData.user.id;
    const userCookie = signupRes.headers.get("set-cookie") || "";

    // 2. Admin directly assigns plan and entitlements via publicMetadata
    const updateRes = await app.request(
      `/api/admin/users/${userId}/metadata`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", cookie: adminCookie },
        body: JSON.stringify({
          publicMetadata: {
            plan: "custom_enterprise",
            entitlements: ["unlimited_export", "dedicated_support"],
            limits: { max_projects: 999 },
          },
        }),
      },
      mockEnv
    );
    expect(updateRes.status).toBe(200);

    // 3. Fetch token/session and verify JWT payload reflects direct entitlements
    const tokenRes = await app.request(
      "/api/auth/token",
      {
        method: "GET",
        headers: { cookie: userCookie },
      },
      mockEnv
    );
    expect(tokenRes.status).toBe(200);
    const { token } = (await tokenRes.json()) as any;

    const jwksRes = await app.request("/.well-known/jwks.json", { method: "GET" }, mockEnv);
    const jwksData = (await jwksRes.json()) as any;
    const localJWKS = createLocalJWKSet(jwksData);

    const { payload } = await jwtVerify(token, localJWKS);
    expect(payload.sub).toBe(userId);
    expect(payload.plan).toBe("custom_enterprise");
    expect(payload.entitlements).toEqual(["unlimited_export", "dedicated_support"]);
    expect(payload.limits).toEqual({ max_projects: 999 });
  });
});
