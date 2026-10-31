import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
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

export interface EdgekitUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  username?: string | null;
  phoneNumber?: string | null;
  locale?: string;
  timezone?: string;
  publicMetadata?: Record<string, any>;
  unsafeMetadata?: Record<string, any>;
  roles?: string[];
  permissions?: string[];
  plan?: string;
  entitlements?: string[];
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
  const client = useMemo(
    () => createEdgekitClient(apiUrl, publishableKey),
    [apiUrl, publishableKey]
  );

  const [session, setSession] = useState<any | null>(null);
  const [user, setUser] = useState<EdgekitUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        const res = await client.getSession();
        if (mounted) {
          if (res?.data?.session) {
            setSession(res.data.session);
            setUser(res.data.user as EdgekitUser);
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
  }, [client]);

  const signOut = async () => {
    await client.signOut();
    setSession(null);
    setUser(null);
  };

  const getToken = async (): Promise<string | null> => {
    try {
      const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/auth/token`, {
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

  const value: EdgekitContextValue = {
    apiUrl,
    publishableKey,
    client,
    user,
    session,
    isLoaded,
    isSignedIn: Boolean(session && user),
    signOut,
    getToken,
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
 * Access authentication and session state.
 */
export function useAuth() {
  const { isSignedIn, isLoaded, session, user, signOut, getToken } = useEdgekit();
  return {
    isSignedIn,
    isLoaded,
    userId: user?.id ?? null,
    sessionId: session?.id ?? null,
    signOut,
    getToken,
  };
}

/**
 * Access current user profile and metadata.
 */
export function useUser() {
  const { user, isLoaded, isSignedIn } = useEdgekit();
  return {
    user,
    isLoaded,
    isSignedIn,
  };
}

/**
 * Access active organization and roles.
 */
export function useOrganization() {
  const { session, client, isLoaded } = useEdgekit();
  const activeOrgId = session?.activeOrganizationId || null;

  return {
    organizationId: activeOrgId,
    isLoaded,
    switchOrganization: async (orgId: string | null) => {
      if (orgId) {
        await client.organization.setActive({ organizationId: orgId });
      } else {
        await client.organization.setActive({ organizationId: null });
      }
    },
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
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Control Component: Protects UI elements by verifying user roles or permissions.
 */
export const Protect: React.FC<ProtectProps> = ({
  role,
  permission,
  fallback = null,
  children,
}) => {
  const { user, isSignedIn, isLoaded } = useEdgekit();

  if (!isLoaded) return null;
  if (!isSignedIn || !user) return <>{fallback}</>;

  if (role) {
    const roles = user.roles || [];
    if (!roles.includes(role)) {
      return <>{fallback}</>;
    }
  }

  if (permission) {
    const permissions = user.permissions || [];
    if (!permissions.includes(permission)) {
      return <>{fallback}</>;
    }
  }

  return <>{children}</>;
};
