import { describe, it, expect, beforeEach } from "vitest";
import { createMockD1 } from "../helpers/mock-d1";
import app from "@/index";
import * as schema from "@/db/schema";
import { drizzle } from "drizzle-orm/d1";

describe("Consumer User Profile, Preferences & Sessions Integration Tests", () => {
  let mockEnv: any;

  beforeEach(async () => {
    mockEnv = {
      DB: createMockD1(),
      BETTER_AUTH_SECRET: "test-better-auth-secret-min-32-chars-long",
      BETTER_AUTH_URL: "http://localhost:8787",
      ENVIRONMENT: "test",
      RATE_LIMIT_ENABLED: "false",
    };
  });

  it("consumer user can get and update their profile, preferences, and unsafeMetadata", async () => {
    // 1. Register a consumer user
    const userEmail = "consumer@example.com";
    const userPass = "ConsumerPass123!";
    const signupRes = await app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Consumer User",
          email: userEmail,
          password: userPass,
        }),
      },
      mockEnv
    );

    expect(signupRes.status).toBe(200);
    const cookie = signupRes.headers.get("set-cookie") || "";

    // 2. GET /api/v1/users/me as consumer
    const getMeRes = await app.request(
      "/api/v1/users/me",
      {
        method: "GET",
        headers: {
          Cookie: cookie,
        },
      },
      mockEnv
    );

    expect(getMeRes.status).toBe(200);
    const meData = (await getMeRes.json()) as any;
    expect(meData.user.email).toBe(userEmail);
    expect(meData.user.name).toBe("Consumer User");
    expect(meData.user.locale).toBe("en");
    expect(meData.user.timezone).toBe("UTC");
    expect(meData.user.theme).toBe("system");
    expect(meData.user.preferences).toEqual({});
    expect(meData.user.unsafeMetadata).toEqual({});
    expect(meData.user.publicMetadata).toEqual({});
    // Security check: privateMetadata must NOT be returned to the client
    expect(meData.user.privateMetadata).toBeUndefined();

    // 3. Consumer attempts to modify publicMetadata or privateMetadata directly -> 403 Forbidden
    const forbiddenPatch = await app.request(
      "/api/v1/users/me",
      {
        method: "PATCH",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          publicMetadata: { roleOverride: "hacked" },
        }),
      },
      mockEnv
    );
    expect(forbiddenPatch.status).toBe(403);

    // 4. Consumer updates legitimate fields: firstName, lastName, locale, theme, preferences, unsafeMetadata
    const patchRes = await app.request(
      "/api/v1/users/me",
      {
        method: "PATCH",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: "John",
          lastName: "Doe",
          locale: "pt-BR",
          timezone: "America/Sao_Paulo",
          theme: "dark",
          preferences: {
            emailNotifications: true,
            pushNotifications: false,
          },
          unsafeMetadata: {
            onboardingStep: 2,
            hasSeenTutorial: true,
          },
        }),
      },
      mockEnv
    );

    expect(patchRes.status).toBe(200);
    const patchedData = (await patchRes.json()) as any;
    expect(patchedData.success).toBe(true);
    expect(patchedData.user.firstName).toBe("John");
    expect(patchedData.user.lastName).toBe("Doe");
    expect(patchedData.user.locale).toBe("pt-BR");
    expect(patchedData.user.timezone).toBe("America/Sao_Paulo");
    expect(patchedData.user.theme).toBe("dark");
    expect(patchedData.user.preferences).toEqual({
      emailNotifications: true,
      pushNotifications: false,
    });
    expect(patchedData.user.unsafeMetadata).toEqual({
      onboardingStep: 2,
      hasSeenTutorial: true,
    });

    // 5. Query active sessions
    const sessionsRes = await app.request(
      "/api/v1/users/me/sessions",
      {
        method: "GET",
        headers: { Cookie: cookie },
      },
      mockEnv
    );

    expect(sessionsRes.status).toBe(200);
    const sessionsData = (await sessionsRes.json()) as any;
    expect(Array.isArray(sessionsData.sessions)).toBe(true);
    expect(sessionsData.sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessionsData.sessions[0].isCurrent).toBe(true);
  });

  it("backend server with Secret Key can read and update privateMetadata and publicMetadata for any user", async () => {
    // 1. Create a user
    const userEmail = "m2m-target@example.com";
    const signupRes = await app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "M2M Target",
          email: userEmail,
          password: "TargetPassword123!",
        }),
      },
      mockEnv
    );
    expect(signupRes.status).toBe(200);
    const userId = ((await signupRes.json()) as any).user.id;

    // 2. Insert a secret API key into D1
    const db = drizzle(mockEnv.DB);
    const secretKeyToken = "sk_live_test_m2m_key_12345";
    const keyHashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(secretKeyToken)
    );
    const keyHash = Array.from(new Uint8Array(keyHashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    await db.insert(schema.apiKey).values({
      id: "key-m2m-test-1",
      name: "M2M Secret Key",
      keyType: "secret",
      prefix: "sk_live_test",
      displayKey: "sk_live_test_...2345",
      keyHash,
      environment: "production",
      role: "admin",
      createdAt: new Date(),
    });

    // 3. M2M Backend updates publicMetadata AND privateMetadata via PATCH /api/v1/users/me
    const m2mPatchRes = await app.request(
      "/api/v1/users/me",
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${secretKeyToken}`,
          "x-user-id": userId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          publicMetadata: { planTier: "enterprise", company: "Acme Corp" },
          privateMetadata: { internalNotes: "VIP customer", stripeCustomerId: "cus_123" },
        }),
      },
      mockEnv
    );

    expect(m2mPatchRes.status).toBe(200);

    // 4. M2M Backend reads user profile via GET /api/v1/users/me
    const m2mGetRes = await app.request(
      "/api/v1/users/me",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKeyToken}`,
          "x-user-id": userId,
        },
      },
      mockEnv
    );

    expect(m2mGetRes.status).toBe(200);
    const m2mUserData = (await m2mGetRes.json()) as any;
    expect(m2mUserData.user.publicMetadata).toEqual({
      planTier: "enterprise",
      company: "Acme Corp",
    });
    // For M2M Secret Key caller, privateMetadata is returned
    expect(m2mUserData.user.privateMetadata).toEqual({
      internalNotes: "VIP customer",
      stripeCustomerId: "cus_123",
    });
  });
});
