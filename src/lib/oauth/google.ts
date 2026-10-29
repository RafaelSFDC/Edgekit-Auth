import { Google, generateCodeVerifier, generateState } from "arctic";
import type { NormalizedProfile, OAuthProviderConfig } from "./types";

export function createGoogleProvider(config: OAuthProviderConfig) {
  const client = new Google(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  return {
    createAuthorizationURL(): {
      url: URL;
      state: string;
      codeVerifier: string;
    } {
      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const url = client.createAuthorizationURL(state, codeVerifier, [
        "openid",
        "profile",
        "email",
      ]);
      return { url, state, codeVerifier };
    },

    async validateCallback(
      code: string,
      codeVerifier: string
    ): Promise<NormalizedProfile> {
      const tokens = await client.validateAuthorizationCode(code, codeVerifier);
      const accessToken = tokens.accessToken();

      const res = await fetch(
        "https://openidconnect.googleapis.com/v1/userinfo",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!res.ok) {
        throw new Error(`Failed to fetch Google user profile: ${res.statusText}`);
      }

      const data = (await res.json()) as {
        sub: string;
        email?: string;
        given_name?: string;
        family_name?: string;
        picture?: string;
        name?: string;
      };

      return {
        provider: "google",
        providerUserId: data.sub,
        email: data.email ?? null,
        firstName: data.given_name ?? data.name ?? null,
        lastName: data.family_name ?? null,
        imageUrl: data.picture ?? null,
        raw: data as Record<string, unknown>,
      };
    },
  };
}
