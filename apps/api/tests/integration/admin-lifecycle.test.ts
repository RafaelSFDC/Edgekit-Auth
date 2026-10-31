import { describe, it, expect, beforeEach } from "vitest";
import app from "@/index";
import { createMockD1 } from "../helpers/mock-d1";
import type { Bindings } from "@/types/env";

describe("Admin Operations & User Lifecycle Integration Tests", () => {
  let mockEnv: Bindings;
  let adminCookie: string;

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
  });

  it("admin can create a new user directly", async () => {
    const res = await app.request(
      "/api/auth/admin/create-user",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          email: "criado.por.admin@empresa.com",
          password: "SenhaForte123!",
          name: "Criado Manualmente",
          role: "user",
        }),
      },
      mockEnv
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe("criado.por.admin@empresa.com");
  });

  it("admin can list users", async () => {
    const res = await app.request(
      "/api/auth/admin/list-users",
      {
        method: "GET",
        headers: { Cookie: adminCookie },
      },
      mockEnv
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.users).toBeDefined();
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.users.length).toBeGreaterThanOrEqual(1);
  });

  it("admin can update user role (promote to admin and demote to user)", async () => {
    // 1. Create a regular user
    const createRes = await app.request(
      "/api/auth/admin/create-user",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          email: "promover@empresa.com",
          password: "SenhaForte123!",
          name: "Candidato Admin",
          role: "user",
        }),
      },
      mockEnv
    );
    const user = ((await createRes.json()) as any).user;

    // 2. Promote to admin
    const promoteRes = await app.request(
      "/api/auth/admin/set-role",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          userId: user.id,
          role: "admin",
        }),
      },
      mockEnv
    );
    expect(promoteRes.status).toBe(200);
    const promotedBody = (await promoteRes.json()) as any;
    expect(promotedBody.user.role).toBe("admin");

    // 3. Demote back to user
    const demoteRes = await app.request(
      "/api/auth/admin/set-role",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          userId: user.id,
          role: "user",
        }),
      },
      mockEnv
    );
    expect(demoteRes.status).toBe(200);
    const demotedBody = (await demoteRes.json()) as any;
    expect(demotedBody.user.role).toBe("user");
  });

  it("admin can ban user, preventing sign-in, and unban restoring access", async () => {
    const targetEmail = "suspenso@empresa.com";
    const targetPassword = "SenhaAlvo123!";

    // 1. Create target user
    const createRes = await app.request(
      "/api/auth/admin/create-user",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          email: targetEmail,
          password: targetPassword,
          name: "Usuario Problematico",
          role: "user",
        }),
      },
      mockEnv
    );
    const user = ((await createRes.json()) as any).user;

    // 2. Ban user
    const banRes = await app.request(
      "/api/auth/admin/ban-user",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          userId: user.id,
          banReason: "Violacao dos termos de servico",
        }),
      },
      mockEnv
    );
    expect(banRes.status).toBe(200);

    // 3. Attempt sign-in with banned user -> should fail with 403 or error
    const signInRes = await app.request(
      "/api/auth/sign-in/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: targetEmail,
          password: targetPassword,
        }),
      },
      mockEnv
    );
    expect(signInRes.status).toBeGreaterThanOrEqual(400);

    // 4. Unban user
    const unbanRes = await app.request(
      "/api/auth/admin/unban-user",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      },
      mockEnv
    );
    expect(unbanRes.status).toBe(200);

    // 5. Attempt sign-in again -> should succeed
    const signInAfterUnban = await app.request(
      "/api/auth/sign-in/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: targetEmail,
          password: targetPassword,
        }),
      },
      mockEnv
    );
    expect(signInAfterUnban.status).toBe(200);
  });

  it("admin can remove user from database", async () => {
    // 1. Create user
    const createRes = await app.request(
      "/api/auth/admin/create-user",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          email: "deletar@empresa.com",
          password: "SenhaDeletar123!",
          name: "Conta Temporaria",
        }),
      },
      mockEnv
    );
    const user = ((await createRes.json()) as any).user;

    // 2. Remove user
    const removeRes = await app.request(
      "/api/auth/admin/remove-user",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      },
      mockEnv
    );
    expect(removeRes.status).toBe(200);
  });
});
