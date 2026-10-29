import { describe, it, expect } from "vitest";
import {
  getSigningKeys,
  getJWKS,
  signSessionToken,
  verifySessionToken,
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
});
