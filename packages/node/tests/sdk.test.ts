import { describe, it, expect } from "vitest";
import { createEdgekitAuth } from "../src/index";
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from "jose";

describe("@edgekit/node SDK Unit Tests", () => {
  const apiUrl = "http://localhost:8787";
  const auth = createEdgekitAuth({ apiUrl });

  it("verifies asymmetric token offline via JWKS override with rich claims", async () => {
    // 1. Generate ephemeral RSA/EdDSA key pair for unit test
    const { privateKey, publicKey } = await generateKeyPair("EdDSA");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "test-key-1";
    publicJwk.alg = "EdDSA";

    const localJWKS = createLocalJWKSet({
      keys: [publicJwk],
    });

    // 2. Sign a valid token
    const token = await new SignJWT({
      email: "engineer@company.com",
      name: "Senior Engineer",
      roles: ["engineer", "lead"],
      permissions: ["deploy:prod", "code:review"],
      org_id: "org_alpha",
      org_role: "admin",
      plan: "pro",
      entitlements: ["priority_support", "team_analytics"],
      limits: { max_members: 50 },
    })
      .setProtectedHeader({ alg: "EdDSA", kid: "test-key-1" })
      .setSubject("usr_12345")
      .setIssuer(apiUrl)
      .setExpirationTime("2h")
      .sign(privateKey);

    // 3. Verify via SDK
    const session = await auth.verifyToken(`Bearer ${token}`, {
      jwksOverride: localJWKS,
    });

    expect(session).not.toBeNull();
    expect(session?.userId).toBe("usr_12345");
    expect(session?.email).toBe("engineer@company.com");
    expect(session?.roles).toEqual(["engineer", "lead"]);
    expect(session?.permissions).toEqual(["deploy:prod", "code:review"]);
    expect(session?.orgId).toBe("org_alpha");
    expect(session?.orgRole).toBe("admin");
    expect(session?.plan).toBe("pro");
    expect(session?.entitlements).toEqual(["priority_support", "team_analytics"]);
    expect(session?.limits).toEqual({ max_members: 50 });
  });

  it("returns null for invalid or expired token", async () => {
    const session = await auth.verifyToken("invalid.token.here");
    expect(session).toBeNull();
  });

  it("verifies webhook HMAC-SHA256 signatures accurately", async () => {
    const payload = JSON.stringify({ event: "user.created", data: { id: "u_1" } });
    const secret = "super-secret-webhook-signing-key";

    // Generate valid HMAC
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
    const validSig = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const isValid = await auth.verifyWebhookSignature(payload, validSig, secret);
    expect(isValid).toBe(true);

    const isInvalid = await auth.verifyWebhookSignature(payload, "wrong_signature", secret);
    expect(isInvalid).toBe(false);
  });
});
