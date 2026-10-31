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

export interface HasQuery {
  role?: string;
  permission?: string;
  orgRole?: string;
  orgPermission?: string;
  feature?: string;
  plan?: string;
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
   * Checks authorization predicates against a verified session.
   * Matches role, permission, orgRole, orgPermission, feature or plan.
   */
  public has(session: EdgekitSessionPayload | null | undefined, query: HasQuery): boolean {
    if (!session) return false;

    if (query.role && !session.roles?.includes(query.role)) {
      return false;
    }

    if (query.permission) {
      const perms = session.permissions || [];
      if (!perms.includes(query.permission) && !perms.includes("*")) {
        return false;
      }
    }

    if (query.orgRole) {
      if (session.orgRole !== query.orgRole) {
        return false;
      }
    }

    if (query.orgPermission) {
      if (session.orgRole === "owner") {
        // Owner has full org permissions
      } else {
        const orgPerms = session.orgPermissions || [];
        if (!orgPerms.includes(query.orgPermission) && !orgPerms.includes("*")) {
          return false;
        }
      }
    }

    if (query.feature && !session.entitlements?.includes(query.feature)) {
      return false;
    }

    if (query.plan && session.plan !== query.plan) {
      return false;
    }

    return true;
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

  /**
   * Internal helper for executing authenticated M2M requests with Secret Key
   */
  private async m2mFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.secretKey) {
      throw new Error("[EdgekitAuth] secretKey is required to make M2M API calls.");
    }

    const url = `${this.apiUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${this.secretKey}`);
    headers.set("Content-Type", "application/json");

    const res = await fetch(url, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || `M2M Request Failed with status ${res.status}`);
    }

    return data as T;
  }

  /**
   * M2M User Management APIs
   */
  public readonly users = {
    list: (params?: { page?: number; limit?: number; search?: string }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set("page", String(params.page));
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.search) q.set("search", params.search);
      return this.m2mFetch<{ users: any[]; pagination: any }>(`/api/v1/users?${q.toString()}`);
    },
    get: (userId: string) => this.m2mFetch<{ user: any }>(`/api/v1/users/${userId}`),
    update: (userId: string, data: Record<string, any>) =>
      this.m2mFetch<{ success: boolean; user: any }>(`/api/v1/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (userId: string) =>
      this.m2mFetch<{ success: boolean }>(`/api/v1/users/${userId}`, {
        method: "DELETE",
      }),
  };

  /**
   * M2M Organization Management APIs
   */
  public readonly organizations = {
    list: (params?: { page?: number; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set("page", String(params.page));
      if (params?.limit) q.set("limit", String(params.limit));
      return this.m2mFetch<{ organizations: any[]; pagination?: any }>(`/api/v1/organizations?${q.toString()}`);
    },
    get: (orgId: string) => this.m2mFetch<{ organization: any }>(`/api/v1/organizations/${orgId}`),
    create: (data: { name: string; slug?: string; logo?: string; metadata?: Record<string, any>; maxMembers?: number }) =>
      this.m2mFetch<{ success: boolean; organization: any }>("/api/v1/organizations", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (orgId: string, data: { name?: string; slug?: string; logo?: string; metadata?: Record<string, any>; maxMembers?: number }) =>
      this.m2mFetch<{ success: boolean; organization: any }>(`/api/v1/organizations/${orgId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (orgId: string) =>
      this.m2mFetch<{ success: boolean }>(`/api/v1/organizations/${orgId}`, {
        method: "DELETE",
      }),
    transferOwnership: (orgId: string, newOwnerId: string) =>
      this.m2mFetch<{ success: boolean }>(`/api/v1/organizations/${orgId}/transfer-ownership`, {
        method: "POST",
        body: JSON.stringify({ newOwnerId }),
      }),
    members: {
      list: (orgId: string) => this.m2mFetch<{ members: any[] }>(`/api/v1/organizations/${orgId}/members`),
      updateRole: (orgId: string, memberId: string, role: string) =>
        this.m2mFetch<{ success: boolean; member: any }>(`/api/v1/organizations/${orgId}/members/${memberId}`, {
          method: "PATCH",
          body: JSON.stringify({ role }),
        }),
      remove: (orgId: string, memberId: string) =>
        this.m2mFetch<{ success: boolean }>(`/api/v1/organizations/${orgId}/members/${memberId}`, {
          method: "DELETE",
        }),
    },
    invitations: {
      create: (orgId: string, data: { email: string; role?: string }) =>
        this.m2mFetch<{ success: boolean; invitation: any }>(`/api/v1/organizations/${orgId}/invitations`, {
          method: "POST",
          body: JSON.stringify(data),
        }),
      cancel: (orgId: string, inviteId: string) =>
        this.m2mFetch<{ success: boolean }>(`/api/v1/organizations/${orgId}/invitations/${inviteId}`, {
          method: "DELETE",
        }),
    },
  };

  /**
   * M2M Billing & Subscription Management APIs
   */
  public readonly billing = {
    plans: {
      list: () => this.m2mFetch<{ plans: any[] }>("/api/billing/plans"),
      create: (data: Record<string, any>) =>
        this.m2mFetch<{ success: boolean; planId: string }>("/api/billing/admin/plans", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      update: (id: string, data: Record<string, any>) =>
        this.m2mFetch<{ success: boolean; plan: any }>(`/api/billing/admin/plans/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
      delete: (id: string) =>
        this.m2mFetch<{ success: boolean }>(`/api/billing/admin/plans/${id}`, {
          method: "DELETE",
        }),
    },
    subscriptions: {
      list: () => this.m2mFetch<{ subscriptions: any[] }>("/api/billing/admin/subscriptions"),
      assign: (data: { targetType: "organization" | "user"; targetId: string; planId: string; status?: string; trialDays?: number }) =>
        this.m2mFetch<{ success: boolean; subscription: any }>("/api/billing/admin/subscriptions/assign", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      cancel: (subscriptionId: string) =>
        this.m2mFetch<{ success: boolean }>(`/api/billing/admin/subscriptions/${subscriptionId}/cancel`, {
          method: "POST",
        }),
    },
  };
}

/**
 * Factory helper for initializing the Node.js SDK instance.
 */
export function createEdgekitAuth(config: EdgekitNodeConfig): EdgekitAuth {
  return new EdgekitAuth(config);
}
