import { describe, it, expect, beforeEach } from "vitest";
import app from "@/index";
import { createMockD1 } from "../helpers/mock-d1";
import type { Bindings } from "@/types/env";

describe("Edgekit Auth (Better Auth) Integration Tests", () => {
  let mockEnv: Bindings;

  beforeEach(() => {
    mockEnv = {
      ENVIRONMENT: "development",
      APP_URL: "http://localhost:8787",
      BETTER_AUTH_URL: "http://localhost:8787",
      BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long-123456",
      DB: createMockD1(),
    };
  });

  describe("Service Health & Discovery", () => {
    it("GET / should return edgekit service info", async () => {
      const res = await app.request("/", {}, mockEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.status).toBe("running");
      expect(body.name).toBe("edgekit-auth");
      expect(body.engine).toBe("better-auth");
    });

    it("GET /health should return healthy status", async () => {
      const res = await app.request("/health", {}, mockEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.status).toBe("healthy");
    });

    it("GET /.well-known/jwks.json should forward to Better Auth JWKS", async () => {
      const res = await app.request("/.well-known/jwks.json", {}, mockEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.keys).toBeDefined();
      expect(Array.isArray(body.keys)).toBe(true);
    });

    it("GET /api/auth/jwks should return JWKS keys", async () => {
      const res = await app.request("/api/auth/jwks", {}, mockEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.keys).toBeDefined();
    });

    it("GET /api/auth/open-api/generate-schema should return auto-generated OpenAPI specification", async () => {
      const res = await app.request("/api/auth/open-api/generate-schema", {}, mockEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.openapi).toBeDefined();
      expect(body.paths).toBeDefined();
      expect(body.paths["/sign-in/email"]).toBeDefined();
      expect(body.paths["/sign-up/email"]).toBeDefined();
    });

    it("GET /docs should serve Swagger UI interface", async () => {
      const res = await app.request("/docs", {}, mockEnv);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("swagger-ui");
    });
  });

  describe("Email & Password Authentication", () => {
    const testUser = {
      email: "novo.usuario@exemplo.com",
      password: "SenhaSuperSegura123!",
      name: "Usuario Teste",
    };

    it("POST /api/auth/sign-up/email should register a new user successfully", async () => {
      const res = await app.request(
        "/api/auth/sign-up/email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(testUser),
        },
        mockEnv
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe(testUser.email);
      expect(body.user.name).toBe(testUser.name);
      expect(body.token).toBeDefined();

      // Check cookie
      const cookieHeader = res.headers.get("set-cookie");
      expect(cookieHeader).toBeDefined();
    });

    it("POST /api/auth/sign-in/email should authenticate existing user", async () => {
      // 1. Sign up first
      await app.request(
        "/api/auth/sign-up/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(testUser),
        },
        mockEnv
      );

      // 2. Sign in with correct password
      const res = await app.request(
        "/api/auth/sign-in/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testUser.email,
            password: testUser.password,
          }),
        },
        mockEnv
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.user.email).toBe(testUser.email);
      expect(body.token).toBeDefined();
    });

    it("POST /api/auth/sign-in/email with invalid password should fail", async () => {
      await app.request(
        "/api/auth/sign-up/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(testUser),
        },
        mockEnv
      );

      const res = await app.request(
        "/api/auth/sign-in/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testUser.email,
            password: "SenhaErrada!",
          }),
        },
        mockEnv
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Session Validation & Bearer Plugin", () => {
    it("GET /api/auth/get-session without credentials should return null", async () => {
      const res = await app.request("/api/auth/get-session", {}, mockEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body).toBeNull();
    });

    it("GET /api/auth/get-session with Authorization: Bearer <token> should return session", async () => {
      // 1. Sign up to get token
      const signUpRes = await app.request(
        "/api/auth/sign-up/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "bearer@exemplo.com",
            password: "Senha123Segura!",
            name: "Bearer User",
          }),
        },
        mockEnv
      );

      const signUpBody = (await signUpRes.json()) as any;
      const token = signUpBody.token;
      expect(token).toBeDefined();

      // 2. Fetch session using Bearer header
      const sessionRes = await app.request(
        "/api/auth/get-session",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        mockEnv
      );

      expect(sessionRes.status).toBe(200);
      const sessionBody = (await sessionRes.json()) as any;
      expect(sessionBody.user).toBeDefined();
      expect(sessionBody.user.email).toBe("bearer@exemplo.com");
    });
  });
});
