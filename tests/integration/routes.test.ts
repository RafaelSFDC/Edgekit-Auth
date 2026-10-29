import { describe, it, expect } from "vitest";
import app from "@/index";

const mockEnv = {
  ENVIRONMENT: "development",
  APP_URL: "http://localhost:8787",
  JWT_ISSUER: "https://auth.local",
  JWT_AUDIENCE: "hono-auth-client",
  ADMIN_SECRET_KEY: "sk_test_mock_secret_key_12345",
  DB: {} as any,
};

describe("Integration Route Tests", () => {
  it("GET / should return service status", async () => {
    const res = await app.request("/", {}, mockEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("running");
    expect(body.name).toBe("hono-auth");
  });

  it("GET /health should return healthy", async () => {
    const res = await app.request("/health", {}, mockEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("healthy");
  });

  it("GET /.well-known/jwks.json should return public JWKS", async () => {
    const res = await app.request("/.well-known/jwks.json", {}, mockEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys).toBeDefined();
    expect(body.keys.length).toBeGreaterThan(0);
  });

  it("GET /.well-known/openid-configuration should return discovery document", async () => {
    const res = await app.request("/.well-known/openid-configuration", {}, mockEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issuer).toBe("https://auth.local");
    expect(body.jwks_uri).toBe("http://localhost:8787/.well-known/jwks.json");
  });

  it("GET /doc should return OpenAPI 3.0 specification", async () => {
    const res = await app.request("/doc", {}, mockEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe("3.0.3");
    expect(body.info.title).toContain("Hono Auth");
  });

  it("GET /v1/client/handshake without auth should return unauthenticated state", async () => {
    const res = await app.request("/v1/client/handshake", {}, mockEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBeNull();
    expect(body.session).toBeNull();
  });

  it("GET /v1/client/users/me without auth should return 401", async () => {
    const res = await app.request("/v1/client/users/me", {}, mockEnv);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.errors[0].message).toBe("Authentication required");
  });

  it("GET /v1/backend/users without key should return 401", async () => {
    const res = await app.request("/v1/backend/users", {}, mockEnv);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.errors[0].message).toContain("Missing Authorization");
  });

  it("GET /v1/backend/users with wrong key should return 403", async () => {
    const res = await app.request(
      "/v1/backend/users",
      {
        headers: {
          Authorization: "Bearer wrong_key",
        },
      },
      mockEnv
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.errors[0].message).toContain("Invalid secret key");
  });
});
