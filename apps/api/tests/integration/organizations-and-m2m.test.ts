import { describe, it, expect, beforeEach } from "vitest";
import app from "@/index";
import { createMockD1 } from "../helpers/mock-d1";
import type { Bindings } from "@/types/env";

describe("Organizations, Quotas, M2M & Settings Integration Tests", () => {
  let mockEnv: Bindings;
  let adminCookie: string;
  let userCookie: string;
  let user2Cookie: string;
  let userId: string;
  let user2Id: string;
  let secretKey: string;

  beforeEach(async () => {
    mockEnv = {
      DB: createMockD1(),
      BETTER_AUTH_SECRET: "test-secret-must-be-at-least-32-chars-long!",
      BETTER_AUTH_URL: "http://localhost:8787",
      ENVIRONMENT: "test",
      RATE_LIMIT_ENABLED: "false",
      FEATURE_BILLING: "true",
      FEATURE_ORGANIZATIONS: "true",
      FEATURE_RBAC: "true",
    };

    // 1. Initial Setup for Super Admin
    const setupRes = await app.request(
      "/api/setup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Super Administrator",
          email: "superadmin@edgekit.dev",
          password: "SuperAdminSecret123!",
        }),
      },
      mockEnv
    );
    adminCookie = setupRes.headers.get("set-cookie") || "";

    // 2. Generate M2M Secret Key
    const keyRes = await app.request(
      "/api/admin/api-keys",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          name: "Backend Service Key",
          keyType: "secret",
          role: "admin",
        }),
      },
      mockEnv
    );
    const keyData = (await keyRes.json()) as any;
    secretKey = keyData.apiKey.rawKey;

    // 3. Register Consumer User 1
    const user1Res = await app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Dev Alice",
          email: "alice@company.io",
          password: "AlicePassword123!",
        }),
      },
      mockEnv
    );
    userCookie = user1Res.headers.get("set-cookie") || "";
    const user1Data = (await user1Res.json()) as any;
    userId = user1Data.user.id;

    // 4. Register Consumer User 2
    const user2Res = await app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Dev Bob",
          email: "bob@company.io",
          password: "BobPassword123!",
        }),
      },
      mockEnv
    );
    user2Cookie = user2Res.headers.get("set-cookie") || "";
    const user2Data = (await user2Res.json()) as any;
    user2Id = user2Data.user.id;
  });

  it("consumer user can create organization, manage members, transfer ownership, and leave", async () => {
    // 1. Alice creates an organization via POST /api/v1/organizations
    const createRes = await app.request(
      "/api/v1/organizations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: userCookie,
        },
        body: JSON.stringify({
          name: "Acme Cloud",
          slug: "acme-cloud",
          maxMembers: 2,
        }),
      },
      mockEnv
    );

    expect(createRes.status).toBe(201);
    const createData = (await createRes.json()) as any;
    expect(createData.success).toBe(true);
    expect(createData.organization.name).toBe("Acme Cloud");
    const orgId = createData.organization.id;

    // 2. Alice fetches organization details
    const getRes = await app.request(
      `/api/v1/organizations/${orgId}`,
      {
        headers: { Cookie: userCookie },
      },
      mockEnv
    );
    expect(getRes.status).toBe(200);
    const getData = (await getRes.json()) as any;
    expect(getData.organization.currentUserRole).toBe("owner");
    expect(getData.organization.membersCount).toBe(1);

    // 3. Alice invites Bob
    const inviteRes = await app.request(
      `/api/v1/organizations/${orgId}/invitations`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: userCookie,
        },
        body: JSON.stringify({
          email: "bob@company.io",
          role: "member",
        }),
      },
      mockEnv
    );
    expect(inviteRes.status).toBe(201);
    const inviteData = (await inviteRes.json()) as any;
    const inviteId = inviteData.invitation.id;

    // 4. Bob accepts invitation
    const acceptRes = await app.request(
      `/api/v1/users/me/invitations/${inviteId}/accept`,
      {
        method: "POST",
        headers: { Cookie: user2Cookie },
      },
      mockEnv
    );
    expect(acceptRes.status).toBe(200);

    // 5. Acme Cloud now has 2 members (hitting maxMembers limit of 2)
    const listMembersRes = await app.request(
      `/api/v1/organizations/${orgId}/members`,
      {
        headers: { Cookie: userCookie },
      },
      mockEnv
    );
    expect(listMembersRes.status).toBe(200);
    const membersData = (await listMembersRes.json()) as any;
    expect(membersData.members.length).toBe(2);

    // 6. Inviting a 3rd member should be rejected due to QuotaExceeded (maxMembers = 2)
    const quotaFailRes = await app.request(
      `/api/v1/organizations/${orgId}/invitations`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: userCookie,
        },
        body: JSON.stringify({
          email: "charlie@company.io",
          role: "member",
        }),
      },
      mockEnv
    );
    expect(quotaFailRes.status).toBe(400);
    const quotaFailData = (await quotaFailRes.json()) as any;
    expect(quotaFailData.error).toBe("QuotaExceeded");

    // 7. Alice transfers ownership to Bob
    const transferRes = await app.request(
      `/api/v1/organizations/${orgId}/transfer-ownership`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: userCookie,
        },
        body: JSON.stringify({
          newOwnerId: user2Id,
        }),
      },
      mockEnv
    );
    expect(transferRes.status).toBe(200);

    // 8. Now Bob is owner and Alice is admin
    const checkRoleRes = await app.request(
      `/api/v1/organizations/${orgId}`,
      {
        headers: { Cookie: userCookie },
      },
      mockEnv
    );
    const checkRoleData = (await checkRoleRes.json()) as any;
    expect(checkRoleData.organization.currentUserRole).toBe("admin");

    // 9. Alice leaves the organization
    const aliceMemberRecord = membersData.members.find((m: any) => m.userId === userId);
    const leaveRes = await app.request(
      `/api/v1/organizations/${orgId}/members/${aliceMemberRecord.id}`,
      {
        method: "DELETE",
        headers: { Cookie: userCookie },
      },
      mockEnv
    );
    expect(leaveRes.status).toBe(200);
  });

  it("should support M2M Secret Key operations for Users and Organizations", async () => {
    // 1. List users via M2M Secret Key
    const listUsersRes = await app.request(
      "/api/v1/users",
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      },
      mockEnv
    );
    expect(listUsersRes.status).toBe(200);
    const usersData = (await listUsersRes.json()) as any;
    expect(usersData.users.length).toBeGreaterThanOrEqual(3);

    // 2. Fetch single user by ID via M2M
    const getUserRes = await app.request(
      `/api/v1/users/${userId}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      },
      mockEnv
    );
    expect(getUserRes.status).toBe(200);
    const userData = (await getUserRes.json()) as any;
    expect(userData.user.id).toBe(userId);
    expect(userData.user.email).toBe("alice@company.io");

    // 3. Update user metadata via M2M
    const patchUserRes = await app.request(
      `/api/v1/users/${userId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          publicMetadata: { planTier: "enterprise", customField: 42 },
          privateMetadata: { internalNotes: "VIP client" },
        }),
      },
      mockEnv
    );
    expect(patchUserRes.status).toBe(200);

    // Verify metadata saved
    const verifyUserRes = await app.request(
      `/api/v1/users/${userId}`,
      {
        headers: { Authorization: `Bearer ${secretKey}` },
      },
      mockEnv
    );
    const verifyData = (await verifyUserRes.json()) as any;
    expect(verifyData.user.publicMetadata.planTier).toBe("enterprise");
    expect(verifyData.user.privateMetadata.internalNotes).toBe("VIP client");
  });

  it("should support installation settings and multi-endpoint webhooks", async () => {
    // 1. Super Admin reads default installation settings
    const getSettingsRes = await app.request(
      "/api/admin/settings",
      {
        headers: { Cookie: adminCookie },
      },
      mockEnv
    );
    expect(getSettingsRes.status).toBe(200);
    const settingsData = (await getSettingsRes.json()) as any;
    expect(settingsData.settings.instanceName).toBe("Edgekit Auth");
    expect(settingsData.settings.allowUserOrgCreation).toBe(true);

    // 2. Super Admin updates settings to disable user organization creation
    const patchSettingsRes = await app.request(
      "/api/admin/settings",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          instanceName: "My SaaS Identity",
          allowUserOrgCreation: false,
        }),
      },
      mockEnv
    );
    expect(patchSettingsRes.status).toBe(200);

    // 3. Consumer user attempting to create an org is now rejected with 403 Forbidden
    const blockedOrgRes = await app.request(
      "/api/v1/organizations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: userCookie,
        },
        body: JSON.stringify({
          name: "Blocked Org",
        }),
      },
      mockEnv
    );
    expect(blockedOrgRes.status).toBe(403);

    // 4. Register a multi-endpoint webhook
    const createWebhookRes = await app.request(
      "/api/admin/webhooks/endpoints",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          url: "https://myserver.com/webhooks/edgekit",
          description: "Primary Event Receptor",
          events: ["user.*", "organization.*"],
        }),
      },
      mockEnv
    );
    expect(createWebhookRes.status).toBe(201);
    const webhookData = (await createWebhookRes.json()) as any;
    expect(webhookData.endpoint.url).toBe("https://myserver.com/webhooks/edgekit");

    // 5. List webhook endpoints
    const listWebhooksRes = await app.request(
      "/api/admin/webhooks/endpoints",
      {
        headers: { Cookie: adminCookie },
      },
      mockEnv
    );
    expect(listWebhooksRes.status).toBe(200);
    const listData = (await listWebhooksRes.json()) as any;
    expect(listData.endpoints.length).toBe(1);
  });

  it("should support manual plan assignment and subscription cancellation", async () => {
    // 1. Super Admin creates a plan with granted permissions and trial days
    const createPlanRes = await app.request(
      "/api/billing/admin/plans",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          name: "Enterprise Pro",
          slug: "enterprise-pro",
          priceMonthly: 199,
          priceYearly: 1990,
          currency: "usd",
          features: ["analytics:advanced", "sso:saml", "export:audit"],
          grantedPermissions: ["audit:export", "org:admin_elevated"],
          trialDays: 14,
        }),
      },
      mockEnv
    );
    expect(createPlanRes.status).toBe(200);

    // 2. Super Admin directly assigns the plan to Alice without Stripe
    const assignRes = await app.request(
      "/api/billing/admin/subscriptions/assign",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          targetType: "user",
          targetId: userId,
          planId: "enterprise-pro",
          status: "active",
        }),
      },
      mockEnv
    );
    expect(assignRes.status).toBe(200);

    // 3. Alice verifies active plan and granted permissions via GET /api/v1/users/me
    const meRes = await app.request(
      "/api/v1/users/me",
      {
        headers: { Cookie: userCookie },
      },
      mockEnv
    );
    expect(meRes.status).toBe(200);
    const meData = (await meRes.json()) as any;
    expect(meData.user.plan).toBe("enterprise-pro");
    expect(meData.user.entitlements).toContain("analytics:advanced");
    expect(meData.user.permissions).toContain("audit:export");

    // 4. Alice requests cancellation of the subscription
    const cancelRes = await app.request(
      "/api/billing/cancel",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: userCookie,
        },
        body: JSON.stringify({
          targetType: "user",
          targetId: userId,
        }),
      },
      mockEnv
    );
    expect(cancelRes.status).toBe(200);
  });
});
