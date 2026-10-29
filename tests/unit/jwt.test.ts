import { describe, it, expect } from "vitest";
import * as jose from "jose";
import {
  getSigningKeys,
  getJWKS,
  signSessionToken,
  verifySessionToken,
  normalizePem,
} from "@/lib/jwt";

describe("JWT & JWKS Module", () => {
  it("should generate and export public JWKS", async () => {
    const jwks = await getJWKS();
    expect(jwks).toBeDefined();
    expect(Array.isArray(jwks.keys)).toBe(true);
    expect(jwks.keys.length).toBeGreaterThan(0);

    const key = jwks.keys[0];
    expect(key.kty).toBe("EC");
    expect(key.crv).toBe("P-256");
    expect(key.use).toBe("sig");
    expect(key.alg).toBe("ES256");
    expect(key.kid).toBe("key_hono_auth_default");
  });

  it("should sign and verify session tokens", async () => {
    const claims = {
      sub: "user_test123",
      sid: "sess_test456",
      email: "test@example.com",
      org_id: "org_alpha",
      org_role: "org:admin",
    };

    const token = await signSessionToken(claims, undefined, "10m");
    expect(typeof token).toBe("string");

    const verified = await verifySessionToken(token);
    expect(verified.sub).toBe(claims.sub);
    expect(verified.sid).toBe(claims.sid);
    expect(verified.email).toBe(claims.email);
    expect(verified.org_id).toBe(claims.org_id);
    expect(verified.org_role).toBe(claims.org_role);
  });

  it("should normalize PEM strings with escaped newlines and quotes", () => {
    const raw = `"-----BEGIN PUBLIC KEY-----\\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\\n-----END PUBLIC KEY-----\\n"`;
    const normalized = normalizePem(raw);
    expect(normalized).not.toContain("\\n");
    expect(normalized).toContain("\n");
    expect(normalized.startsWith('"')).toBe(false);
    expect(normalized.endsWith('"')).toBe(false);
  });

  it("should successfully import and sign using PEM config with escaped newlines", async () => {
    const { privateKey, publicKey } = await jose.generateKeyPair("ES256", {
      extractable: true,
    });
    const privPem = (await jose.exportPKCS8(privateKey)).replace(/\n/g, "\\n");
    const pubPem = (await jose.exportSPKI(publicKey)).replace(/\n/g, "\\n");

    const config = {
      privateKeyPem: privPem,
      publicKeyPem: pubPem,
      issuer: "https://auth.custom.com",
      audience: "test-client",
    };

    const token = await signSessionToken(
      { sub: "u_custom", sid: "s_custom" },
      config,
      "5m"
    );

    const verified = await verifySessionToken(token, config);
    expect(verified.sub).toBe("u_custom");
    expect(verified.iss).toBe("https://auth.custom.com");
  });
});
