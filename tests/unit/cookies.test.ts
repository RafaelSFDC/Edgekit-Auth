import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppContext } from "@/types/env";
import {
  setSessionCookies,
  clearSessionCookies,
  getRefreshCookie,
  getSessionCookie,
  SESSION_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from "@/lib/cookies";

describe("Cookies Helper Module", () => {
  it("should set session and refresh cookies with secure flags", async () => {
    const app = new Hono<AppContext>();

    app.get("/set-session", (c) => {
      setSessionCookies(c, {
        sessionToken: "jwt_token_123",
        refreshToken: "refresh_token_456",
        sessionId: "sess_789",
      });
      return c.text("ok");
    });

    const res = await app.request("/set-session", {}, {
      ENVIRONMENT: "production",
      COOKIE_DOMAIN: ".example.com",
    } as any);

    expect(res.status).toBe(200);
    const headers = res.headers as any;
    const setCookieHeaders: string[] = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie") || ""];
    expect(setCookieHeaders.length).toBeGreaterThanOrEqual(1);

    const sessionCookie = setCookieHeaders.find((c: string) => c.includes(SESSION_COOKIE_NAME));
    const refreshCookie = setCookieHeaders.find((c: string) => c.includes(REFRESH_COOKIE_NAME));

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain("jwt_token_123");
    expect(sessionCookie).toContain("Domain=.example.com");
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("Secure");
    expect(sessionCookie).toContain("SameSite=Lax");

    expect(refreshCookie).toBeDefined();
    expect(decodeURIComponent(refreshCookie!)).toContain("sess_789:refresh_token_456");
    expect(refreshCookie).toContain("Domain=.example.com");
  });

  it("should omit Domain attribute when COOKIE_DOMAIN is not provided", async () => {
    const app = new Hono<AppContext>();

    app.get("/set-local", (c) => {
      setSessionCookies(c, {
        sessionToken: "local_token",
        refreshToken: "local_refresh",
        sessionId: "sess_local",
      });
      return c.text("ok");
    });

    const res = await app.request("/set-local", {}, {
      ENVIRONMENT: "development",
    } as any);

    const headers = res.headers as any;
    const setCookieHeaders: string[] = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie") || ""];
    const sessionCookie = setCookieHeaders.find((c: string) => c.includes(SESSION_COOKIE_NAME));

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).not.toContain("Domain=");
    // In development ENVIRONMENT, Secure should not be forced
    expect(sessionCookie).not.toContain("Secure");
  });

  it("should clear session and refresh cookies with matching domain", async () => {
    const app = new Hono<AppContext>();

    app.get("/clear-session", (c) => {
      clearSessionCookies(c);
      return c.text("cleared");
    });

    const res = await app.request("/clear-session", {}, {
      COOKIE_DOMAIN: ".example.com",
    } as any);

    const headers = res.headers as any;
    const setCookieHeaders: string[] = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie") || ""];
    expect(setCookieHeaders.length).toBeGreaterThanOrEqual(1);

    for (const cookieHeader of setCookieHeaders) {
      expect(cookieHeader).toContain("Max-Age=0");
      expect(cookieHeader).toContain("Domain=.example.com");
    }
  });

  it("should parse getRefreshCookie and getSessionCookie from request", async () => {
    const app = new Hono<AppContext>();

    app.get("/read", (c) => {
      const session = getSessionCookie(c);
      const refresh = getRefreshCookie(c);
      return c.json({ session, refresh });
    });

    const res = await app.request("/read", {
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=my_session_token; ${REFRESH_COOKIE_NAME}=sess_1:refresh_1`,
      },
    });

    const body = (await res.json()) as { session?: string; refresh?: string };
    expect(body.session).toBe("my_session_token");
    expect(body.refresh).toBe("sess_1:refresh_1");
  });
});
