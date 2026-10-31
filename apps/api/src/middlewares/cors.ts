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
        if (!allowedList || allowedList.length === 0) {
          // Development / local fallback: reflect origin
          return origin;
        }
        return allowedList.includes(origin.toLowerCase()) ? origin : null;
      },
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      exposeHeaders: ["Content-Length", "X-Total-Count", "set-auth-token"],
      credentials: true,
      maxAge: 86400,
    });

    return corsMiddleware(c, next);
  };
}
