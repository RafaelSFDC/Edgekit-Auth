import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppContext } from "@/types/env";

export function adminAuth() {
  return createMiddleware<AppContext>(async (c, next) => {
    const authHeader = c.req.header("Authorization");
    const secretKey = c.env.ADMIN_SECRET_KEY || "sk_test_hono_auth_secret_key_123456789";

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new HTTPException(401, {
        message: "Missing Authorization header for Backend API",
      });
    }

    const providedKey = authHeader.substring(7);
    if (providedKey !== secretKey) {
      throw new HTTPException(403, {
        message: "Invalid secret key for Backend API",
      });
    }

    await next();
  });
}
