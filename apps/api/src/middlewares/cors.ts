import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";
import type { AppContext } from "@/types/env";

export function createCorsMiddleware(): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const allowedOriginsEnv = c.env?.ALLOWED_ORIGINS;
    const allowedList = allowedOriginsEnv
      ? allowedOriginsEnv
          .split(",")
          .map((o) => o.trim().toLowerCase())
          .filter(Boolean)
      : null;

    const corsMiddleware = cors({
      origin: (origin) => {
        if (!origin) return "*";
        if (allowedList && allowedList.length > 0) {
          return allowedList.includes(origin.toLowerCase()) ? origin : null;
        }

        // Development / local fallback: safely allow localhost, 127.0.0.1 or same-origin
        try {
          const originUrl = new URL(origin);
          const requestUrl = new URL(c.req.url);
          if (
            originUrl.host === requestUrl.host ||
            originUrl.hostname === "localhost" ||
            originUrl.hostname === "127.0.0.1" ||
            originUrl.hostname === "[::1]"
          ) {
            return origin;
          }
        } catch {
          return null;
        }

        return origin;
      },
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
      allowHeaders: ["Content-Type", "Authorization", "X-Requested-With", "x-api-key"],
      exposeHeaders: ["Content-Length", "X-Total-Count", "set-auth-token"],
      credentials: true,
      maxAge: 86400,
    });

    return corsMiddleware(c, next);
  };
}
