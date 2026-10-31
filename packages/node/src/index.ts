import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface EdgekitNodeConfig {
  /**
   * Base URL of your self-hosted Edgekit Auth instance.
   * e.g. "http://localhost:8787" or "https://auth.mycompany.com"
   */
  apiUrl: string;

  /**
   * Optional Secret Key for M2M API management calls (sk_live_... / sk_test_...).
   */
  secretKey?: string;

  /**
   * Custom JWKS URL override (defaults to `${apiUrl}/.well-known/jwks.json`).
   */
  jwksUrl?: string;
}

export interface EdgekitSessionPayload {
  userId: string;
  email: string;
  name?: string;
  username?: string | null;
  locale?: string;
  timezone?: string;
  isSuperAdmin?: boolean;
  publicMetadata?: Record<string, any>;
  orgId?: string | null;
  orgSlug?: string | null;
  orgRole?: string | null;
  orgPermissions?: string[];
  roles?: string[];
  permissions?: string[];
  plan?: string;
  entitlements?: string[];
  limits?: Record<string, any>;
  rawPayload: Record<string, any>;
}

export interface VerifyTokenOptions {
  /**
   * Expected audience or issuer.
   */
  audience?: string | string[];
  issuer?: string;
  /**
   * Optional custom JWKS key store (useful for offline unit testing).
   */
  jwksOverride?: JWTVerifyGetKey;
}

export class EdgekitAuth {
  public readonly apiUrl: string;
  public readonly secretKey?: string;
  public readonly jwksUrl: string;
  private jwks: JWTVerifyGetKey;

  constructor(config: EdgekitNodeConfig) {
    if (!config.apiUrl) {
      throw new Error("[EdgekitAuth] apiUrl is required.");
    }
    this.apiUrl = config.apiUrl.replace(/\/+$/, "");
    this.secretKey = config.secretKey;
    this.jwksUrl = config.jwksUrl || `${this.apiUrl}/.well-known/jwks.json`;
    this.jwks = createRemoteJWKSet(new URL(this.jwksUrl));
  }

  /**
   * Verifies a JWT offline using asymmetric JWKS with zero network latency.
   * Extracts user identity, active organization, roles, permissions and entitlements.
   */
  public async verifyToken(
    bearerToken: string,
    options: VerifyTokenOptions = {}
  ): Promise<EdgekitSessionPayload | null> {
    if (!bearerToken || typeof bearerToken !== "string") {
      return null;
    }

    const cleanToken = bearerToken.startsWith("Bearer ")
      ? bearerToken.slice(7).trim()
      : bearerToken.trim();

    try {
      const keySet = options.jwksOverride || this.jwks;
      const { payload } = await jwtVerify(cleanToken, keySet, {
        issuer: options.issuer || this.apiUrl,
        audience: options.audience,
      });

      return {
        userId: (payload.sub || "") as string,
        email: (payload.email || "") as string,
        name: payload.name as string | undefined,
        username: payload.username as string | null | undefined,
        locale: payload.locale as string | undefined,
        timezone: payload.timezone as string | undefined,
        isSuperAdmin: Boolean(payload.isSuperAdmin),
        publicMetadata: (payload.publicMetadata || {}) as Record<string, any>,
        orgId: (payload.org_id || null) as string | null,
        orgSlug: (payload.org_slug || null) as string | null,
        orgRole: (payload.org_role || null) as string | null,
        orgPermissions: (payload.org_permissions || []) as string[],
        roles: (payload.roles || []) as string[],
        permissions: (payload.permissions || []) as string[],
        plan: (payload.plan || "free") as string,
        entitlements: (payload.entitlements || []) as string[],
        limits: (payload.limits || {}) as Record<string, any>,
        rawPayload: payload as Record<string, any>,
      };
    } catch {
      return null;
    }
  }

  /**
   * Verifies an incoming webhook payload using HMAC-SHA256 signature (X-Edgekit-Signature).
   */
  public async verifyWebhookSignature(
    rawBody: string | Uint8Array,
    signature: string,
    secret: string
  ): Promise<boolean> {
    if (!rawBody || !signature || !secret) return false;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const bodyBytes: any = typeof rawBody === "string" ? enc.encode(rawBody) : rawBody;
    const computedSignature = await crypto.subtle.sign("HMAC", key, bodyBytes);
    const hex = Array.from(new Uint8Array(computedSignature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return hex === signature.trim().toLowerCase();
  }
}

/**
 * Factory helper for initializing the Node.js SDK instance.
 */
export function createEdgekitAuth(config: EdgekitNodeConfig): EdgekitAuth {
  return new EdgekitAuth(config);
}
