import { createAuthClient } from "better-auth/client";
import {
  twoFactorClient,
  organizationClient,
  adminClient,
  magicLinkClient,
  jwtClient,
} from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

/**
 * Creates a strongly-typed Better Auth client instance for use in any frontend
 * (React, Vue, Svelte, Next.js, or vanilla TypeScript).
 */
export function createEdgekitClient(baseURL = "http://localhost:8787") {
  return createAuthClient({
    baseURL,
    plugins: [
      twoFactorClient(),
      passkeyClient(),
      organizationClient(),
      adminClient(),
      magicLinkClient(),
      jwtClient(),
    ],
  });
}

/**
 * Default shared client singleton pointing to local dev / standard base URL.
 */
export const authClient = createEdgekitClient();
export type AuthClient = typeof authClient;
