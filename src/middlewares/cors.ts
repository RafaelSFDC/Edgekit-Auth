import { cors } from "hono/cors";

export function createCorsMiddleware() {
  return cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "x-hono-auth-client-id",
    ],
    exposeHeaders: ["Content-Length", "X-Total-Count", "set-auth-token"],
    credentials: true,
    maxAge: 86400,
  });
}
