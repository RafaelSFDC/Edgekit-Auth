import { createAuthClient } from 'better-auth/react';
import {
  adminClient,
  organizationClient,
  twoFactorClient,
  magicLinkClient,
  emailOTPClient,
  usernameClient,
  phoneNumberClient,
  anonymousClient,
  multiSessionClient,
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
    emailOTPClient(),
    usernameClient(),
    phoneNumberClient(),
    anonymousClient(),
    multiSessionClient(),
  ],
});

export type AuthClient = typeof authClient;
