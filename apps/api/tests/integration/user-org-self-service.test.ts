import { describe, it, expect, beforeEach } from "vitest";
import app from "@/index";
import { createMockD1 } from "../helpers/mock-d1";
import type { Bindings } from "@/types/env";

describe("Consumer User Organization Self-Service Integration Tests", () => {
  let mockEnv: Bindings;
  let adminCookie: string;
  let userCookie: string;
  let userId: string;
  let userEmail: string;

  beforeEach(async () => {
    mockEnv = {
      DB: createMockD1(),
      BETTER_AUTH_SECRET: "test-secret-must-be-at-least-32-chars-long!",
      BETTER_AUTH_URL: "http://localhost:8787",
      ENVIRONMENT: "test",
      RATE_LIMIT_ENABLED: "false",
    };

    // 1. Setup Admin
    const setupRes = await app.request(
      "/api/setup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "System Admin",
          email: "superadmin@edgekit.dev",
          password: "SuperAdminSecret123!",
        }),
      },
      mockEnv
    );
    adminCookie = setupRes.headers.get("set-cookie") || "";

    // 2. Register Consumer User
    userEmail = "consumer@startup.io";
    const userRes = await app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Consumer Dev",
          email: userEmail,
          password: "ConsumerPassword123!",
        }),
      },
      mockEnv
    );
    userCookie = userRes.headers.get("set-cookie") || "";
    const userData = (await userRes.json()) as any;
    userId = userData.user.id;
  });

  it("consumer can list organizations, receive invitations, accept invitations and switch active organization", async () => {
    // 1. Admin creates an organization
    const orgRes = await app.request(
      "/api/auth/organization/create",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: adminCookie },
        body: JSON.stringify({
          name: "Acme Corporation",
          slug: "acme-corp",
        }),
      },
      mockEnv
    );
    expect(orgRes.status).toBe(200);
    const orgData = (await orgRes.json()) as any;
    const orgId = orgData.id;

    // 2. Admin invites consumer user to organization
    const inviteRes = await app.request(
      "/api/auth/organization/invite-member",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: adminCookie },
        body: JSON.stringify({
          organizationId: orgId,
          email: userEmail,
          role: "member",
        }),
      },
      mockEnv
    );
    expect(inviteRes.status).toBe(200);
    const inviteData = (await inviteRes.json()) as any;
    const inviteId = inviteData.id;

    // 3. Consumer lists invitations via /api/v1/users/me/invitations
    const listInvitesRes = await app.request(
      "/api/v1/users/me/invitations",
      {
        method: "GET",
        headers: { cookie: userCookie },
      },
      mockEnv
    );
    expect(listInvitesRes.status).toBe(200);
    const listInvitesData = (await listInvitesRes.json()) as any;
    expect(listInvitesData.invitations.length).toBe(1);
    expect(listInvitesData.invitations[0].id).toBe(inviteId);
    expect(listInvitesData.invitations[0].organizationName).toBe("Acme Corporation");

    // 4. Consumer accepts the invitation via /api/v1/users/me/invitations/:id/accept
    const acceptRes = await app.request(
      `/api/v1/users/me/invitations/${inviteId}/accept`,
      {
        method: "POST",
        headers: { cookie: userCookie },
      },
      mockEnv
    );
    expect(acceptRes.status).toBe(200);
    const acceptData = (await acceptRes.json()) as any;
    expect(acceptData.success).toBe(true);

    // 5. Consumer lists organizations via /api/v1/users/me/organizations
    const userOrgsRes = await app.request(
      "/api/v1/users/me/organizations",
      {
        method: "GET",
        headers: { cookie: userCookie },
      },
      mockEnv
    );
    expect(userOrgsRes.status).toBe(200);
    const userOrgsData = (await userOrgsRes.json()) as any;
    expect(userOrgsData.organizations.length).toBe(1);
    expect(userOrgsData.organizations[0].name).toBe("Acme Corporation");
    expect(userOrgsData.organizations[0].role).toBe("member");

    // 6. Consumer switches active organization via /api/v1/users/me/active-organization
    const switchRes = await app.request(
      "/api/v1/users/me/active-organization",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: userCookie },
        body: JSON.stringify({ organizationId: orgId }),
      },
      mockEnv
    );
    expect(switchRes.status).toBe(200);
    const switchData = (await switchRes.json()) as any;
    expect(switchData.success).toBe(true);
    expect(switchData.activeOrganizationId).toBe(orgId);
  });
});
