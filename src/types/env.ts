import type { D1Database } from "@cloudflare/workers-types";
import type { Database } from "@/db";

export interface Bindings {
  DB: D1Database;
  ENVIRONMENT?: string;
  APP_URL?: string;
  JWT_ISSUER?: string;
  JWT_AUDIENCE?: string;
  COOKIE_SECRET?: string;
  ADMIN_SECRET_KEY?: string;

  // Key Pair for Asymmetric JWT signing (ES256)
  JWT_PRIVATE_KEY_PEM?: string;
  JWT_PUBLIC_KEY_PEM?: string;

  // OAuth Credentials
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;

  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_REDIRECT_URI?: string;

  // Webhook
  WEBHOOK_SECRET?: string;
}

export interface Variables {
  db: Database;
  userId?: string;
  sessionId?: string;
  organizationId?: string;
}

export interface AppContext {
  Bindings: Bindings;
  Variables: Variables;
}
