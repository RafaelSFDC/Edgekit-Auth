import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { createAuthClient } from "better-auth/react";
import {
  organizationClient,
  twoFactorClient,
  magicLinkClient,
  emailOTPClient,
  usernameClient,
  phoneNumberClient,
  anonymousClient,
} from "better-auth/client/plugins";

export interface EdgekitProviderProps {
  /**
   * Base URL of your self-hosted Edgekit Auth backend.
   * e.g. "https://auth.mycompany.com" or "http://localhost:8787"
   */
  apiUrl: string;

  /**
   * Publishable Key created in your Edgekit Admin Console (pk_live_... / pk_test_...).
   */
  publishableKey: string;

  children: React.ReactNode;
}

export interface EdgekitOrganization {
  id: string;
  name: string;
  slug: string;
  role: string;
  permissions: string[];
  maxMembers?: number | null;
}

export interface EdgekitUser {
  id: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  username?: string | null;
  phoneNumber?: string | null;
  locale?: string;
  timezone?: string;
  theme?: string;
  preferences?: Record<string, any>;
  publicMetadata?: Record<string, any>;
  unsafeMetadata?: Record<string, any>;
  roles?: string[];
  permissions?: string[];
  organization?: EdgekitOrganization | null;
  plan?: string;
  subscriptionStatus?: string;
  entitlements?: string[];
  limits?: Record<string, any>;
  isSuperAdmin?: boolean;
}

export interface HasQuery {
  role?: string;
  permission?: string;
  orgRole?: string;
  orgPermission?: string;
  feature?: string;
  plan?: string;
}

export interface EdgekitContextValue {
  apiUrl: string;
  publishableKey: string;
  client: any;
  user: EdgekitUser | null;
  session: any | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
  refreshUser: () => Promise<void>;
  has: (query: HasQuery) => boolean;
}

const EdgekitContext = createContext<EdgekitContextValue | null>(null);

/**
 * Creates a strongly-typed Better Auth client wired to Edgekit Auth.
 */
export function createEdgekitClient(apiUrl: string, publishableKey: string) {
  return createAuthClient({
    baseURL: apiUrl.replace(/\/+$/, ""),
    fetchOptions: {
      headers: {
        "x-edgekit-publishable-key": publishableKey,
      },
    },
    plugins: [
      organizationClient(),
      twoFactorClient(),
      magicLinkClient(),
      emailOTPClient(),
      usernameClient(),
      phoneNumberClient(),
      anonymousClient(),
    ],
  });
}

/**
 * Root React Context Provider for Edgekit Auth applications.
 */
export const EdgekitProvider: React.FC<EdgekitProviderProps> = ({
  apiUrl,
  publishableKey,
  children,
}) => {
  const normalizedApiUrl = useMemo(() => apiUrl.replace(/\/+$/, ""), [apiUrl]);

  const client = useMemo(
    () => createEdgekitClient(normalizedApiUrl, publishableKey),
    [normalizedApiUrl, publishableKey]
  );

  const [session, setSession] = useState<any | null>(null);
  const [user, setUser] = useState<EdgekitUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const fetchUserProfile = useCallback(async () => {
    try {
      const res = await fetch(`${normalizedApiUrl}/api/v1/users/me`, {
        credentials: "include",
        headers: {
          "x-edgekit-publishable-key": publishableKey,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          return;
        }
      }
    } catch {}
  }, [normalizedApiUrl, publishableKey]);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        const res = await client.getSession();
        if (mounted) {
          if (res?.data?.session) {
            setSession(res.data.session);
            await fetchUserProfile();
          } else {
            setSession(null);
            setUser(null);
          }
        }
      } catch {
        if (mounted) {
          setSession(null);
          setUser(null);
        }
      } finally {
        if (mounted) setIsLoaded(true);
      }
    }

    loadSession();

    return () => {
      mounted = false;
    };
  }, [client, fetchUserProfile]);

  const signOut = async () => {
    await client.signOut();
    setSession(null);
    setUser(null);
  };

  const getToken = async (): Promise<string | null> => {
    try {
      const res = await fetch(`${normalizedApiUrl}/api/auth/token`, {
        credentials: "include",
        headers: {
          "x-edgekit-publishable-key": publishableKey,
        },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.token || null;
    } catch {
      return null;
    }
  };

  const has = useCallback(
    (query: HasQuery): boolean => {
      if (!user) return false;

      if (query.role && !user.roles?.includes(query.role)) {
        return false;
      }

      if (query.permission) {
        const perms = user.permissions || [];
        if (!perms.includes(query.permission) && !perms.includes("*")) {
          return false;
        }
      }

      if (query.orgRole) {
        if (!user.organization || user.organization.role !== query.orgRole) {
          return false;
        }
      }

      if (query.orgPermission) {
        if (user.organization?.role === "owner") {
          // Owner has full org permissions
        } else {
          const orgPerms = user.organization?.permissions || [];
          if (!orgPerms.includes(query.orgPermission) && !orgPerms.includes("*")) {
            return false;
          }
        }
      }

      if (query.feature && !user.entitlements?.includes(query.feature)) {
        return false;
      }

      if (query.plan && user.plan !== query.plan) {
        return false;
      }

      return true;
    },
    [user]
  );

  const value: EdgekitContextValue = {
    apiUrl: normalizedApiUrl,
    publishableKey,
    client,
    user,
    session,
    isLoaded,
    isSignedIn: Boolean(session && user),
    signOut,
    getToken,
    refreshUser: fetchUserProfile,
    has,
  };

  return <EdgekitContext.Provider value={value}>{children}</EdgekitContext.Provider>;
};

/**
 * Access the core Edgekit Auth context and client.
 */
export function useEdgekit(): EdgekitContextValue {
  const ctx = useContext(EdgekitContext);
  if (!ctx) {
    throw new Error("useEdgekit must be used within an <EdgekitProvider>.");
  }
  return ctx;
}

/**
 * Access authentication and session state, plus Clerk-style has() authorization helper.
 */
export function useAuth() {
  const { isSignedIn, isLoaded, session, user, signOut, getToken, has } = useEdgekit();
  return {
    isSignedIn,
    isLoaded,
    userId: user?.id ?? null,
    sessionId: session?.id ?? null,
    signOut,
    getToken,
    has,
  };
}

/**
 * Access current user profile and self-service updates.
 */
export function useUser() {
  const { user, isLoaded, isSignedIn, apiUrl, publishableKey, refreshUser } = useEdgekit();

  const updateUser = async (data: {
    name?: string;
    firstName?: string | null;
    lastName?: string | null;
    image?: string | null;
    locale?: string;
    timezone?: string;
    theme?: string;
    preferences?: Record<string, any>;
    unsafeMetadata?: Record<string, any>;
  }) => {
    const res = await fetch(`${apiUrl}/api/v1/users/me`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-edgekit-publishable-key": publishableKey,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Falha ao atualizar perfil do usuário.");
    }

    await refreshUser();
    return res.json();
  };

  return {
    user,
    isLoaded,
    isSignedIn,
    updateUser,
  };
}

/**
 * Access active organization, members, and organization operations.
 */
export function useOrganization() {
  const { session, user, client, isLoaded, apiUrl, publishableKey, refreshUser } = useEdgekit();
  const activeOrgId = session?.activeOrganizationId || user?.organization?.id || null;

  const switchOrganization = async (orgId: string | null) => {
    if (orgId) {
      await client.organization.setActive({ organizationId: orgId });
    } else {
      await client.organization.setActive({ organizationId: null });
    }
    await refreshUser();
  };

  const createOrganization = async (data: {
    name: string;
    slug?: string;
    logo?: string;
    metadata?: Record<string, any>;
  }) => {
    const res = await fetch(`${apiUrl}/api/v1/organizations`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-edgekit-publishable-key": publishableKey,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Falha ao criar organização.");
    }

    const json = await res.json();
    if (json.organization?.id) {
      await switchOrganization(json.organization.id);
    }
    return json;
  };

  const listOrganizations = async () => {
    const res = await fetch(`${apiUrl}/api/v1/users/me/organizations`, {
      credentials: "include",
      headers: {
        "x-edgekit-publishable-key": publishableKey,
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.organizations || [];
  };

  return {
    organization: user?.organization || null,
    organizationId: activeOrgId,
    isLoaded,
    switchOrganization,
    createOrganization,
    listOrganizations,
  };
}

/**
 * Access current billing subscription, plan features, and checkout.
 */
export function useBilling() {
  const { user, isLoaded, apiUrl, publishableKey, refreshUser } = useEdgekit();

  const checkout = async (params: {
    planId: string;
    billingCycle?: "monthly" | "yearly";
    targetType?: "organization" | "user";
    targetId?: string;
    successUrl?: string;
    cancelUrl?: string;
  }) => {
    const res = await fetch(`${apiUrl}/api/billing/checkout`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-edgekit-publishable-key": publishableKey,
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Falha ao iniciar checkout.");
    }

    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
    return data;
  };

  const openPortal = async (params?: { returnUrl?: string }) => {
    const res = await fetch(`${apiUrl}/api/billing/portal`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-edgekit-publishable-key": publishableKey,
      },
      body: JSON.stringify({
        returnUrl: params?.returnUrl || window.location.href,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Falha ao abrir portal de faturamento.");
    }

    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
    return data;
  };

  const cancelSubscription = async (params?: {
    targetType?: "organization" | "user";
    targetId?: string;
  }) => {
    const res = await fetch(`${apiUrl}/api/billing/cancel`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-edgekit-publishable-key": publishableKey,
      },
      body: JSON.stringify(params || {}),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Falha ao cancelar assinatura.");
    }

    await refreshUser();
    return res.json();
  };

  return {
    plan: user?.plan || "free",
    subscriptionStatus: user?.subscriptionStatus || "none",
    entitlements: user?.entitlements || [],
    limits: user?.limits || {},
    isLoaded,
    checkout,
    openPortal,
    cancelSubscription,
  };
}

/**
 * Control Component: Renders children ONLY when user is signed in.
 */
export const SignedIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isSignedIn, isLoaded } = useEdgekit();
  if (!isLoaded || !isSignedIn) return null;
  return <>{children}</>;
};

/**
 * Control Component: Renders children ONLY when user is signed out.
 */
export const SignedOut: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isSignedIn, isLoaded } = useEdgekit();
  if (!isLoaded || isSignedIn) return null;
  return <>{children}</>;
};

export interface ProtectProps {
  role?: string;
  permission?: string;
  orgRole?: string;
  orgPermission?: string;
  feature?: string;
  plan?: string;
  condition?: (has: (query: HasQuery) => boolean) => boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Control Component: Protects UI elements by verifying user roles, permissions, features, or custom conditions.
 */
export const Protect: React.FC<ProtectProps> = ({
  role,
  permission,
  orgRole,
  orgPermission,
  feature,
  plan,
  condition,
  fallback = null,
  children,
}) => {
  const { isSignedIn, isLoaded, has } = useEdgekit();

  if (!isLoaded) return null;
  if (!isSignedIn) return <>{fallback}</>;

  if (condition) {
    if (!condition(has)) {
      return <>{fallback}</>;
    }
  }

  if (role && !has({ role })) return <>{fallback}</>;
  if (permission && !has({ permission })) return <>{fallback}</>;
  if (orgRole && !has({ orgRole })) return <>{fallback}</>;
  if (orgPermission && !has({ orgPermission })) return <>{fallback}</>;
  if (feature && !has({ feature })) return <>{fallback}</>;
  if (plan && !has({ plan })) return <>{fallback}</>;

  return <>{children}</>;
};
