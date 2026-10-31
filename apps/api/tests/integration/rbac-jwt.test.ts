import { describe, it, expect, beforeEach } from "vitest";
import app from "@/index";
import { createMockD1 } from "../helpers/mock-d1";
import type { Bindings } from "@/types/env";
import { createLocalJWKSet, jwtVerify } from "jose";

describe("RBAC & Permissions Management Integration Tests", () => {
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
          name: "RBAC Admin",
          email: "rbacadmin@edgekit.dev",
          password: "SuperAdminPass123!",
        }),
      },
      mockEnv
    );
    adminCookie = setupRes.headers.get("set-cookie") || "";
  });

  it("admin can create atomic permissions, roles, and map permissions to roles", async () => {
    // 1. Create permissions
    const perm1 = await app.request(
      "/api/admin/rbac/permissions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: adminCookie },
        body: JSON.stringify({
          key: "invoices:create",
          name: "Criar Faturas",
          category: "Financeiro",
        }),
      },
      mockEnv
    );
    expect(perm1.status).toBe(200);

    const perm2 = await app.request(
      "/api/admin/rbac/permissions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: adminCookie },
        body: JSON.stringify({
          key: "invoices:view",
          name: "Visualizar Faturas",
          category: "Financeiro",
        }),
      },
      mockEnv
    );
    expect(perm2.status).toBe(200);

    // 2. Create Role with mapped permissions
    const roleRes = await app.request(
      "/api/admin/rbac/roles",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: adminCookie },
        body: JSON.stringify({
          key: "finance_manager",
          name: "Gerente Financeiro",
          permissions: ["invoices:create", "invoices:view"],
        }),
      },
      mockEnv
    );
    expect(roleRes.status).toBe(200);

    // 3. List roles and verify mapped permissions
    const listRes = await app.request(
      "/api/admin/rbac/roles",
      {
        method: "GET",
        headers: { cookie: adminCookie },
      },
      mockEnv
    );

    expect(listRes.status).toBe(200);
    const rolesData = (await listRes.json()) as any;
    const found = rolesData.roles.find((r: any) => r.key === "finance_manager");
    expect(found).toBeDefined();
    expect(found.permissions).toContain("invoices:create");
    expect(found.permissions).toContain("invoices:view");
  });

  it("should issue JWT with enriched payload (roles, permissions, plan, entitlements, limits) and verify offline via JWKS in 0ms", async () => {
    // 1. Fetch JWKS public key set from /.well-known/jwks.json
    const jwksRes = await app.request("/.well-known/jwks.json", { method: "GET" }, mockEnv);
    expect(jwksRes.status).toBe(200);
    const jwksData = (await jwksRes.json()) as any;
    expect(jwksData.keys).toBeDefined();
    expect(Array.isArray(jwksData.keys)).toBe(true);

    // 2. Fetch signed JWT session token for authenticated admin
    const tokenRes = await app.request(
      "/api/auth/token",
      {
        method: "GET",
        headers: { cookie: adminCookie },
      },
      mockEnv
    );
    expect(tokenRes.status).toBe(200);
    const tokenData = (await tokenRes.json()) as any;
    expect(tokenData.token).toBeDefined();

    // 3. Offline Verification via jose with Zero Database Calls (0ms)
    const localJWKS = createLocalJWKSet(jwksData);
    const { payload } = await jwtVerify(tokenData.token, localJWKS);

    // 4. Validate rich claims
    expect(payload.sub).toBeDefined();
    expect(payload.email).toBe("rbacadmin@edgekit.dev");
    expect(payload.isSuperAdmin).toBe(true);
    expect(Array.isArray(payload.roles)).toBe(true);
    expect(Array.isArray(payload.permissions)).toBe(true);
    expect(typeof payload.plan).toBe("string");
    expect(Array.isArray(payload.entitlements)).toBe(true);
    expect(typeof payload.limits).toBe("object");
  });
});
