import { createAuthClient } from 'better-auth/react';
import {
  adminClient,
  organizationClient,
  twoFactorClient,
  magicLinkClient,
} from 'better-auth/client/plugins';
import { passkeyClient } from '@better-auth/passkey/client';

const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return (import.meta as any)?.env?.VITE_AUTH_URL || window.location.origin;
  }
  return 'http://localhost:8787';
};

export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
  plugins: [
    adminClient(),
    organizationClient(),
    twoFactorClient(),
    passkeyClient(),
    magicLinkClient(),
  ],
});

export type AuthClient = typeof authClient;
