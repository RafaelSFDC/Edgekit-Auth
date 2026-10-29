import { createAuthClient } from "better-auth/react";
import {
  adminClient,
  organizationClient,
  twoFactorClient,
  magicLinkClient,
} from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_AUTH_URL || window.location.origin,
  plugins: [
    adminClient(),
    organizationClient(),
    twoFactorClient(),
    passkeyClient(),
    magicLinkClient(),
  ],
});

export type AuthClient = typeof authClient;
