import { Hono } from "hono";
import type { AppContext } from "@/types/env";
import { getJWKS } from "@/lib/jwt";

export const jwksRoutes = new Hono<AppContext>();

jwksRoutes.get("/.well-known/jwks.json", async (c) => {
  const jwks = await getJWKS({
    issuer: c.env.JWT_ISSUER,
    audience: c.env.JWT_AUDIENCE,
    publicKeyPem: c.env.JWT_PUBLIC_KEY_PEM,
    privateKeyPem: c.env.JWT_PRIVATE_KEY_PEM,
  });

  c.header("Cache-Control", "public, max-age=3600");
  return c.json(jwks);
});

jwksRoutes.get("/.well-known/openid-configuration", (c) => {
  const issuer = c.env.JWT_ISSUER || "https://auth.local";
  const appUrl = c.env.APP_URL || "http://localhost:8787";

  return c.json({
    issuer,
    jwks_uri: `${appUrl}/.well-known/jwks.json`,
    response_types_supported: ["token", "id_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["ES256"],
    scopes_supported: ["openid", "email", "profile"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    claims_supported: ["sub", "iss", "aud", "exp", "iat", "email", "sid", "org_id", "org_role"],
  });
});
