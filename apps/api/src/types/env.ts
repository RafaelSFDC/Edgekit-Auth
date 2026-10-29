import type { D1Database, Fetcher, KVNamespace } from "@cloudflare/workers-types";
import type { Database } from "@/db";
import type { Auth } from "@/lib/auth";

export interface Bindings {
  DB: D1Database;
  ASSETS?: Fetcher;
  KV?: KVNamespace;
  ENVIRONMENT?: string;
  APP_URL?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  COOKIE_SECRET?: string;
  COOKIE_DOMAIN?: string;

  // Auto-promote specified emails to Admin role upon signup
  ADMIN_EMAILS?: string;

  // Social OAuth Credentials (Plug-and-play via .env)
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;

  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;

  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;

  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;

  // Email Service (Resend)
  RESEND_API_KEY?: string;
  FROM_EMAIL?: string;

  // Webhooks
  WEBHOOK_URL?: string;
  WEBHOOK_SECRET?: string;
}

export interface Variables {
  db: Database;
  auth: Auth;
  userId?: string;
  sessionId?: string;
  organizationId?: string;
}

export interface AppContext {
  Bindings: Bindings;
  Variables: Variables;
}
