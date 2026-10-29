import type { Context } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import type { AppContext } from "@/types/env";

export const SESSION_COOKIE_NAME = "__session";
export const REFRESH_COOKIE_NAME = "__refresh";

export interface SessionTokens {
  sessionToken: string;
  refreshToken: string;
  sessionId: string;
}

/**
 * Sets session and refresh cookies.
 * Honors COOKIE_DOMAIN if set (e.g. '.yourdomain.com' for multi-subdomain sharing).
 */
export function setSessionCookies(
  c: Context<AppContext>,
  tokens: SessionTokens
): void {
  const isSecure = c.env.ENVIRONMENT !== "development";
  const domain = c.env.COOKIE_DOMAIN?.trim() || undefined;

  // Session JWT cookie (short-lived: 5 minutes)
  setCookie(c, SESSION_COOKIE_NAME, tokens.sessionToken, {
    maxAge: 300,
    path: "/",
    httpOnly: true,
    secure: isSecure,
    sameSite: "Lax",
    domain,
  });

  // Refresh token cookie (long-lived: 30 days)
  setCookie(c, REFRESH_COOKIE_NAME, `${tokens.sessionId}:${tokens.refreshToken}`, {
    maxAge: 30 * 86400,
    path: "/",
    httpOnly: true,
    secure: isSecure,
    sameSite: "Lax",
    domain,
  });
}

/**
 * Clears session and refresh cookies across domain and path.
 */
export function clearSessionCookies(c: Context<AppContext>): void {
  const domain = c.env.COOKIE_DOMAIN?.trim() || undefined;

  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: "/",
    domain,
  });

  deleteCookie(c, REFRESH_COOKIE_NAME, {
    path: "/",
    domain,
  });
}

/**
 * Retrieves refresh cookie value in "sessionId:refreshToken" format.
 */
export function getRefreshCookie(c: Context<AppContext>): string | undefined {
  return getCookie(c, REFRESH_COOKIE_NAME);
}

/**
 * Retrieves session token from cookie.
 */
export function getSessionCookie(c: Context<AppContext>): string | undefined {
  return getCookie(c, SESSION_COOKIE_NAME);
}
