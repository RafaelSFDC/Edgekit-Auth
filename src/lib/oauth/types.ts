export interface NormalizedProfile {
  provider: "google" | "github";
  providerUserId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  raw: Record<string, unknown>;
}

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}
