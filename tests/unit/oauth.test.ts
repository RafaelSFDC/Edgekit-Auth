import { describe, it, expect } from "vitest";
import { createGoogleProvider } from "@/lib/oauth/google";
import { createGitHubProvider } from "@/lib/oauth/github";

describe("OAuth Providers", () => {
  it("should create Google authorization URL with PKCE verifier", () => {
    const provider = createGoogleProvider({
      clientId: "mock-google-client-id",
      clientSecret: "mock-google-secret",
      redirectUri: "http://localhost:8787/v1/client/oauth/google/callback",
    });

    const { url, state, codeVerifier } = provider.createAuthorizationURL();

    expect(url.toString()).toContain("accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe("mock-google-client-id");
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("code_challenge")).toBeDefined();
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(typeof codeVerifier).toBe("string");
    expect(codeVerifier.length).toBeGreaterThan(10);
  });

  it("should create GitHub authorization URL", () => {
    const provider = createGitHubProvider({
      clientId: "mock-github-client-id",
      clientSecret: "mock-github-secret",
      redirectUri: "http://localhost:8787/v1/client/oauth/github/callback",
    });

    const { url, state } = provider.createAuthorizationURL();

    expect(url.toString()).toContain("github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("mock-github-client-id");
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("scope")).toContain("read:user");
  });
});
