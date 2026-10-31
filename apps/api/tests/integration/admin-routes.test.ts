import { describe, it, expect, beforeEach } from "vitest";
import app from "@/index";
import { createMockD1 } from "../helpers/mock-d1";
import type { Bindings } from "@/types/env";

describe("Admin Dedicated Management Routes (/api/admin/*)", () => {
  let mockEnv: Bindings;
  let adminCookie: string;
  let userCookie: string;

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

    // 2. Sign up regular user
    const userSignUp = await app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "comum@empresa.com",
          password: "UserPassword123!",
          name: "Usuario Comum",
        }),
      },
      mockEnv
    );
    expect(userSignUp.status).toBe(200);
    userCookie = userSignUp.headers.get("set-cookie") || "";
  });

  it("should deny access to /api/admin/* without session (403)", async () => {
    const res = await app.request("/api/admin/stats", { method: "GET" }, mockEnv);
    expect(res.status).toBe(403);
  });

  it("should deny access to /api/admin/* for non-admin user (403)", async () => {
    const res = await app.request(
      "/api/admin/stats",
      {
        method: "GET",
        headers: { Cookie: userCookie },
      },
      mockEnv
    );
    expect(res.status).toBe(403);
  });

  it("admin can fetch aggregate stats from /api/admin/stats", async () => {
    const res = await app.request(
      "/api/admin/stats",
      {
        method: "GET",
        headers: { Cookie: adminCookie },
      },
      mockEnv
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.totalUsers).toBeGreaterThanOrEqual(2);
    expect(data.totalAdmins).toBe(1);
    expect(data.totalBanned).toBe(0);
    expect(typeof data.activeSessions).toBe("number");
    expect(typeof data.totalOrganizations).toBe("number");
  });

  it("admin can list all organizations across instance via /api/admin/organizations", async () => {
    // Regular user creates an organization
    const createOrgRes = await app.request(
      "/api/auth/organization/create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: userCookie,
        },
        body: JSON.stringify({
          name: "Acme Corp",
          slug: "acme-corp",
        }),
      },
      mockEnv
    );
    expect(createOrgRes.status).toBe(200);
    const createdOrg = (await createOrgRes.json()) as any;

    // Admin (who is NOT a member of Acme Corp) queries global organizations
    const listRes = await app.request(
      "/api/admin/organizations",
      {
        method: "GET",
        headers: { Cookie: adminCookie },
      },
      mockEnv
    );

    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()) as any;
    expect(listData.organizations).toBeDefined();
    expect(Array.isArray(listData.organizations)).toBe(true);

    const acme = listData.organizations.find((o: any) => o.slug === "acme-corp");
    expect(acme).toBeDefined();
    expect(acme.name).toBe("Acme Corp");
    expect(acme.membersCount).toBe(1);
    expect(acme.owner?.email).toBe("comum@empresa.com");

    // Admin fetches details of that specific organization
    const detailsRes = await app.request(
      `/api/admin/organizations/${createdOrg.id}`,
      {
        method: "GET",
        headers: { Cookie: adminCookie },
      },
      mockEnv
    );

    expect(detailsRes.status).toBe(200);
    const detailsData = (await detailsRes.json()) as any;
    expect(detailsData.organization.slug).toBe("acme-corp");
    expect(detailsData.members.length).toBe(1);
    expect(detailsData.members[0].email).toBe("comum@empresa.com");

    // Admin deletes the organization
    const deleteRes = await app.request(
      `/api/admin/organizations/${createdOrg.id}`,
      {
        method: "DELETE",
        headers: { Cookie: adminCookie },
      },
      mockEnv
    );

    expect(deleteRes.status).toBe(200);

    // Verify it is gone
    const verifyRes = await app.request(
      `/api/admin/organizations/${createdOrg.id}`,
      {
        method: "GET",
        headers: { Cookie: adminCookie },
      },
      mockEnv
    );
    expect(verifyRes.status).toBe(404);
  });
});
