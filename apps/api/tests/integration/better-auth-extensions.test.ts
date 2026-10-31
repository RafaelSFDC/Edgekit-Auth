import { describe, it, expect, beforeEach } from "vitest";
import { createMockD1 } from "../helpers/mock-d1";
import app from "@/index";

describe("Better Auth Plugins (Anonymous, Username, Phone OTP, Multi-Session) Integration Tests", () => {
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

  it("should support anonymous guest user sessions", async () => {
    // 1. Sign in as anonymous guest
    const anonRes = await app.request(
      "/api/auth/sign-in/anonymous",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      mockEnv
    );

    expect(anonRes.status).toBe(200);
    const anonData = (await anonRes.json()) as any;
    expect(anonData.user).toBeDefined();
    expect(anonData.user.isAnonymous).toBe(true);
    expect(anonData.user.email).toContain("@guest.edgekit.internal");
    expect(anonData.token || anonRes.headers.get("set-cookie")).toBeDefined();
  });

  it("should support sign-up and sign-in with username", async () => {
    // 1. Sign up with username
    const signupRes = await app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Developer Alice",
          email: "alice@example.com",
          username: "alice_dev",
          password: "AliceSecurePassword123!",
        }),
      },
      mockEnv
    );

    expect(signupRes.status).toBe(200);
    const signupData = (await signupRes.json()) as any;
    expect(signupData.user.username).toBe("alice_dev");

    // 2. Sign in using username instead of email
    const signinRes = await app.request(
      "/api/auth/sign-in/username",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "alice_dev",
          password: "AliceSecurePassword123!",
        }),
      },
      mockEnv
    );

    expect(signinRes.status).toBe(200);
    const signinData = (await signinRes.json()) as any;
    expect(signinData.user.email).toBe("alice@example.com");
    expect(signinData.user.username).toBe("alice_dev");
  });

  it("should support sending phone number SMS OTP", async () => {
    // 1. Create user
    const signupRes = await app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Phone User",
          email: "phone@example.com",
          password: "PhoneUserPass123!",
        }),
      },
      mockEnv
    );
    expect(signupRes.status).toBe(200);
    const cookie = signupRes.headers.get("set-cookie") || "";

    // 2. Request Phone OTP verification
    const otpRes = await app.request(
      "/api/auth/phone-number/send-otp",
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phoneNumber: "+15551234567",
        }),
      },
      mockEnv
    );

    expect(otpRes.status).toBe(200);
    const otpData = (await otpRes.json()) as any;
    expect(otpData.message).toBe("code sent");
  });
});
