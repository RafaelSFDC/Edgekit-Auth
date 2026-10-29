import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import type { AppContext } from "@/types/env";
import { verifySessionToken } from "@/lib/jwt";

export function clientAuth(options: { optional?: boolean } = {}) {
  return createMiddleware<AppContext>(async (c, next) => {
    let token: string | undefined;

    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else {
      token = getCookie(c, "__session");
    }

    if (!token) {
      if (options.optional) {
        return next();
      }
      throw new HTTPException(401, { message: "Authentication required" });
    }

    try {
      const claims = await verifySessionToken(token, {
        issuer: c.env.JWT_ISSUER,
        audience: c.env.JWT_AUDIENCE,
        publicKeyPem: c.env.JWT_PUBLIC_KEY_PEM,
        privateKeyPem: c.env.JWT_PRIVATE_KEY_PEM,
      });

      c.set("userId", claims.sub);
      c.set("sessionId", claims.sid);
      if (claims.org_id) {
        c.set("organizationId", claims.org_id);
      }

      await next();
    } catch {
      if (options.optional) {
        return next();
      }
      throw new HTTPException(401, { message: "Invalid or expired session token" });
    }
  });
}
