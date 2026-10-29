import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import type { AppContext } from "@/types/env";
import { createGoogleProvider, createGitHubProvider, type NormalizedProfile } from "@/lib/oauth";
import { AuthService } from "@/services/auth.service";
import { parseClientInfo } from "@/lib/client-info";
import { setSessionCookies } from "@/lib/cookies";

export const oauthRoutes = new Hono<AppContext>();

oauthRoutes.get("/v1/client/oauth/:provider/authorize", async (c) => {
  const provider = c.req.param("provider");
  const redirectUrl = c.req.query("redirect_url");
  const appUrl = c.env.APP_URL || "http://localhost:8787";
  const isSecure = c.env.ENVIRONMENT !== "development";

  if (redirectUrl) {
    setCookie(c, "__oauth_redirect_url", redirectUrl, {
      maxAge: 600,
      path: "/",
      httpOnly: true,
      secure: isSecure,
      sameSite: "Lax",
    });
  }

  if (provider === "google") {
    if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
      throw new HTTPException(400, {
        message: "Google OAuth is not configured on this instance",
      });
    }

    const google = createGoogleProvider({
      clientId: c.env.GOOGLE_CLIENT_ID,
      clientSecret: c.env.GOOGLE_CLIENT_SECRET,
      redirectUri:
        c.env.GOOGLE_REDIRECT_URI || `${appUrl}/v1/client/oauth/google/callback`,
    });

    const { url, state, codeVerifier } = google.createAuthorizationURL();

    setCookie(c, "__oauth_state", state, {
      maxAge: 600,
      path: "/",
      httpOnly: true,
      secure: isSecure,
      sameSite: "Lax",
    });

    setCookie(c, "__oauth_code_verifier", codeVerifier, {
      maxAge: 600,
      path: "/",
      httpOnly: true,
      secure: isSecure,
      sameSite: "Lax",
    });

    return c.redirect(url.toString());
  }

  if (provider === "github") {
    if (!c.env.GITHUB_CLIENT_ID || !c.env.GITHUB_CLIENT_SECRET) {
      throw new HTTPException(400, {
        message: "GitHub OAuth is not configured on this instance",
      });
    }

    const github = createGitHubProvider({
      clientId: c.env.GITHUB_CLIENT_ID,
      clientSecret: c.env.GITHUB_CLIENT_SECRET,
      redirectUri:
        c.env.GITHUB_REDIRECT_URI || `${appUrl}/v1/client/oauth/github/callback`,
    });

    const { url, state } = github.createAuthorizationURL();

    setCookie(c, "__oauth_state", state, {
      maxAge: 600,
      path: "/",
      httpOnly: true,
      secure: isSecure,
      sameSite: "Lax",
    });

    return c.redirect(url.toString());
  }

  throw new HTTPException(400, {
    message: `Unsupported OAuth provider: ${provider}. Supported providers: google, github`,
  });
});

oauthRoutes.get("/v1/client/oauth/:provider/callback", async (c) => {
  const provider = c.req.param("provider");
  const code = c.req.query("code");
  const state = c.req.query("state");
  const appUrl = c.env.APP_URL || "http://localhost:8787";
  const isSecure = c.env.ENVIRONMENT !== "development";

  if (!code || !state) {
    throw new HTTPException(400, {
      message: "Missing 'code' or 'state' parameters in OAuth callback",
    });
  }

  const storedState = getCookie(c, "__oauth_state");
  if (!storedState || storedState !== state) {
    throw new HTTPException(400, {
      message: "Invalid or expired OAuth state parameter (CSRF protection)",
    });
  }

  let profile: NormalizedProfile;

  if (provider === "google") {
    const codeVerifier = getCookie(c, "__oauth_code_verifier");
    if (!codeVerifier) {
      throw new HTTPException(400, {
        message: "Missing OAuth code verifier cookie for PKCE",
      });
    }

    const google = createGoogleProvider({
      clientId: c.env.GOOGLE_CLIENT_ID!,
      clientSecret: c.env.GOOGLE_CLIENT_SECRET!,
      redirectUri:
        c.env.GOOGLE_REDIRECT_URI || `${appUrl}/v1/client/oauth/google/callback`,
    });

    profile = await google.validateCallback(code, codeVerifier);
  } else if (provider === "github") {
    const github = createGitHubProvider({
      clientId: c.env.GITHUB_CLIENT_ID!,
      clientSecret: c.env.GITHUB_CLIENT_SECRET!,
      redirectUri:
        c.env.GITHUB_REDIRECT_URI || `${appUrl}/v1/client/oauth/github/callback`,
    });

    profile = await github.validateCallback(code);
  } else {
    throw new HTTPException(400, { message: `Unsupported provider: ${provider}` });
  }

  // Clear temporary OAuth cookies
  deleteCookie(c, "__oauth_state", { path: "/" });
  deleteCookie(c, "__oauth_code_verifier", { path: "/" });

  const redirectUrl = getCookie(c, "__oauth_redirect_url");
  if (redirectUrl) {
    deleteCookie(c, "__oauth_redirect_url", { path: "/" });
  }

  const clientInfo = parseClientInfo(c);

  const jwtConfig = {
    issuer: c.env.JWT_ISSUER,
    audience: c.env.JWT_AUDIENCE,
    publicKeyPem: c.env.JWT_PUBLIC_KEY_PEM,
    privateKeyPem: c.env.JWT_PRIVATE_KEY_PEM,
  };

  const result = await AuthService.handleOAuthLogin(
    c.get("db"),
    profile,
    clientInfo,
    jwtConfig
  );

  // Set session and refresh cookies (honors COOKIE_DOMAIN if set)
  setSessionCookies(c, {
    sessionToken: result.token,
    refreshToken: result.refreshToken,
    sessionId: result.session.id,
  });

  if (redirectUrl) {
    return c.redirect(redirectUrl);
  }

  return c.json({
    user: result.user,
    session: result.session,
    token: result.token,
    refreshToken: result.refreshToken,
  });
});
