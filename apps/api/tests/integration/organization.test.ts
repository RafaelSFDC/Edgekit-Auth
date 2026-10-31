import { describe, it, expect, beforeEach } from "vitest";
import app from "@/index";
import { createMockD1 } from "../helpers/mock-d1";
import type { Bindings } from "@/types/env";

describe("Organization & RBAC Integration Tests", () => {
  let mockEnv: Bindings;
  let sessionCookie: string;

  beforeEach(async () => {
    mockEnv = {
      ENVIRONMENT: "development",
      APP_URL: "http://localhost:8787",
      BETTER_AUTH_URL: "http://localhost:8787",
      BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long-123456",
      DB: createMockD1(),
    };

    // 1. Sign up an initial user to act as Organization Owner
    const signUpRes = await app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "owner@empresa.com",
          password: "SenhaSuperSegura123!",
          name: "Owner User",
        }),
      },
      mockEnv
    );

    expect(signUpRes.status).toBe(200);
    sessionCookie = signUpRes.headers.get("set-cookie") || "";
  });

  it("should create an organization and assign owner role", async () => {
    const res = await app.request(
      "/api/auth/organization/create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          name: "Acme Cloud",
          slug: "acme-cloud",
        }),
      },
      mockEnv
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.id).toBeDefined();
    expect(body.name).toBe("Acme Cloud");
    expect(body.slug).toBe("acme-cloud");
  });

  it("should list organizations where user is a member", async () => {
    // 1. Create org
    const createRes = await app.request(
      "/api/auth/organization/create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          name: "Alpha Corp",
          slug: "alpha-corp",
        }),
      },
      mockEnv
    );
    expect(createRes.status).toBe(200);

    // 2. List organizations
    const listRes = await app.request(
      "/api/auth/organization/list",
      {
        method: "GET",
        headers: { Cookie: sessionCookie },
      },
      mockEnv
    );

    expect(listRes.status).toBe(200);
    const orgs = (await listRes.json()) as any[];
    expect(Array.isArray(orgs)).toBe(true);
    expect(orgs.length).toBeGreaterThanOrEqual(1);
    expect(orgs.some((o) => o.slug === "alpha-corp")).toBe(true);
  });

  it("should invite a new member to the organization", async () => {
    // 1. Create organization
    const createRes = await app.request(
      "/api/auth/organization/create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          name: "Beta Labs",
          slug: "beta-labs",
        }),
      },
      mockEnv
    );
    const org = (await createRes.json()) as any;

    // 2. Invite member
    const inviteRes = await app.request(
      "/api/auth/organization/invite-member",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          organizationId: org.id,
          email: "membro@betalabs.com",
          role: "member",
        }),
      },
      mockEnv
    );

    expect(inviteRes.status).toBe(200);
    const invite = (await inviteRes.json()) as any;
    expect(invite.id).toBeDefined();
    expect(invite.email).toBe("membro@betalabs.com");
    expect(invite.organizationId).toBe(org.id);
  });

  it("should retrieve full organization with members and invitations", async () => {
    // 1. Create organization
    const createRes = await app.request(
      "/api/auth/organization/create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          name: "Gamma Tech",
          slug: "gamma-tech",
        }),
      },
      mockEnv
    );
    const org = (await createRes.json()) as any;

    // 2. Fetch full organization details
    const fullRes = await app.request(
      `/api/auth/organization/get-full-organization?organizationId=${org.id}`,
      {
        method: "GET",
        headers: { Cookie: sessionCookie },
      },
      mockEnv
    );

    expect(fullRes.status).toBe(200);
    const fullData = (await fullRes.json()) as any;
    expect(fullData.id).toBe(org.id);
    expect(Array.isArray(fullData.members)).toBe(true);
    expect(fullData.members.length).toBeGreaterThanOrEqual(1);
    expect(fullData.members[0].role).toBe("owner");
  });

  it("should delete organization cleanly", async () => {
    // 1. Create org
    const createRes = await app.request(
      "/api/auth/organization/create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          name: "Delete Me",
          slug: "delete-me",
        }),
      },
      mockEnv
    );
    const org = (await createRes.json()) as any;

    // 2. Delete org
    const deleteRes = await app.request(
      "/api/auth/organization/delete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          organizationId: org.id,
        }),
      },
      mockEnv
    );

    expect(deleteRes.status).toBe(200);
  });
});
