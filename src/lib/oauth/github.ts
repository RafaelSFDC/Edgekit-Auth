import { GitHub, generateState } from "arctic";
import type { NormalizedProfile, OAuthProviderConfig } from "./types";

export function createGitHubProvider(config: OAuthProviderConfig) {
  const client = new GitHub(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  return {
    createAuthorizationURL(): {
      url: URL;
      state: string;
    } {
      const state = generateState();
      const url = client.createAuthorizationURL(state, ["read:user", "user:email"]);
      return { url, state };
    },

    async validateCallback(code: string): Promise<NormalizedProfile> {
      const tokens = await client.validateAuthorizationCode(code);
      const accessToken = tokens.accessToken();

      const userRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "hono-auth-backend",
        },
      });

      if (!userRes.ok) {
        throw new Error(`Failed to fetch GitHub user profile: ${userRes.statusText}`);
      }

      const userData = (await userRes.json()) as {
        id: number;
        login: string;
        name?: string;
        email?: string;
        avatar_url?: string;
      };

      let email = userData.email ?? null;

      // If user's primary email is private in GitHub, fetch from /user/emails
      if (!email) {
        try {
          const emailRes = await fetch("https://api.github.com/user/emails", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "User-Agent": "hono-auth-backend",
            },
          });
          if (emailRes.ok) {
            const emails = (await emailRes.json()) as Array<{
              email: string;
              primary: boolean;
              verified: boolean;
            }>;
            const primary = emails.find((e) => e.primary && e.verified) ?? emails[0];
            if (primary) {
              email = primary.email;
            }
          }
        } catch {
          // Fallback if email endpoint fails
        }
      }

      const nameParts = (userData.name ?? userData.login).split(" ");
      const firstName = nameParts[0] || userData.login;
      const lastName = nameParts.slice(1).join(" ") || null;

      return {
        provider: "github",
        providerUserId: String(userData.id),
        email,
        firstName,
        lastName,
        imageUrl: userData.avatar_url ?? null,
        raw: userData as Record<string, unknown>,
      };
    },
  };
}
