import { Hono } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import type { AppContext } from "@/types/env";

export const docsRoutes = new Hono<AppContext>();

const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Hono Auth API (Clerk Alternative)",
    version: "1.0.0",
    description:
      "Open-source Clerk alternative backend built with Hono for Cloudflare Workers & Edge runtimes. Features third-party social auth (Google, GitHub), asymmetric JWTs, public JWKS for offline verification, multi-session management, and organizations.",
  },
  servers: [
    {
      url: "/",
      description: "Current Server",
    },
  ],
  components: {
    securitySchemes: {
      ClientSession: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Client session JWT token issued by Hono Auth",
      },
      BackendSecretKey: {
        type: "http",
        scheme: "bearer",
        description: "Backend secret key (sk_...)",
      },
      CookieSession: {
        type: "apiKey",
        in: "cookie",
        name: "__session",
      },
    },
  },
  paths: {
    "/.well-known/jwks.json": {
      get: {
        summary: "Public JWKS Endpoint",
        description: "Returns the JSON Web Key Set for offline token verification by microservices.",
        responses: {
          "200": {
            description: "JWKS public keys array",
          },
        },
      },
    },
    "/.well-known/openid-configuration": {
      get: {
        summary: "OpenID Discovery Document",
        description: "Returns standard OIDC configuration metadata.",
        responses: {
          "200": {
            description: "OIDC configuration",
          },
        },
      },
    },
    "/v1/client/oauth/{provider}/authorize": {
      get: {
        summary: "Start OAuth 2.0 PKCE flow",
        description: "Initiates OAuth authorization with Google or GitHub, setting PKCE state cookies.",
        parameters: [
          {
            name: "provider",
            in: "path",
            required: true,
            schema: { type: "string", enum: ["google", "github"] },
          },
          {
            name: "redirect_url",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Frontend destination URL after successful callback",
          },
        ],
        responses: {
          "302": { description: "Redirects to third-party authorization consent screen" },
        },
      },
    },
    "/v1/client/oauth/{provider}/callback": {
      get: {
        summary: "OAuth 2.0 Callback",
        description: "Validates code & state, links or creates user account, starts active session, and sets secure cookies.",
        parameters: [
          {
            name: "provider",
            in: "path",
            required: true,
            schema: { type: "string", enum: ["google", "github"] },
          },
          {
            name: "code",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "state",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "User session and issued tokens" },
          "302": { description: "Redirects to redirect_url if provided" },
        },
      },
    },
    "/v1/client/handshake": {
      get: {
        summary: "Client Handshake",
        description: "Returns the current user profile, active session, linked identities, and organizations.",
        responses: {
          "200": { description: "Current auth state" },
        },
      },
    },
    "/v1/client/sessions/{id}/touch": {
      post: {
        summary: "Refresh Session Token",
        description: "Rotates the refresh token and issues a fresh short-lived JWT.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "New session token and rotated refresh token" },
        },
      },
    },
    "/v1/client/sessions/{id}/remove": {
      post: {
        summary: "Logout / Revoke Session",
        description: "Revokes the active session and clears auth cookies.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Session revoked successfully" },
        },
      },
    },
    "/v1/client/users/me": {
      get: {
        summary: "Get Current User Profile",
        security: [{ ClientSession: [] }, { CookieSession: [] }],
        responses: {
          "200": { description: "Current user profile" },
        },
      },
      patch: {
        summary: "Update Current User Profile",
        security: [{ ClientSession: [] }, { CookieSession: [] }],
        responses: {
          "200": { description: "Updated user profile" },
        },
      },
    },
    "/v1/backend/users": {
      get: {
        summary: "List Users (Admin)",
        security: [{ BackendSecretKey: [] }],
        responses: {
          "200": { description: "List of users" },
        },
      },
      post: {
        summary: "Create User (Admin)",
        security: [{ BackendSecretKey: [] }],
        responses: {
          "201": { description: "User created" },
        },
      },
    },
    "/v1/backend/users/{id}/ban": {
      post: {
        summary: "Ban User (Admin)",
        security: [{ BackendSecretKey: [] }],
        responses: {
          "200": { description: "User banned and sessions revoked" },
        },
      },
    },
    "/v1/backend/organizations": {
      get: {
        summary: "List Organizations (Admin)",
        security: [{ BackendSecretKey: [] }],
        responses: {
          "200": { description: "List of organizations" },
        },
      },
      post: {
        summary: "Create Organization (Admin)",
        security: [{ BackendSecretKey: [] }],
        responses: {
          "201": { description: "Organization created" },
        },
      },
    },
  },
};

docsRoutes.get("/doc", (c) => c.json(openApiSpec));
docsRoutes.get("/docs", swaggerUI({ url: "/doc" }));
