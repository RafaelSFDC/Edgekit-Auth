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
  ALLOWED_ORIGINS?: string;

  // Auto-promote specified emails to Admin role upon signup
  ADMIN_EMAILS?: string;

  // Strict Email Verification Policy
  REQUIRE_EMAIL_VERIFICATION?: string;

  // Social OAuth Credentials (Plug-and-play via .env)
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;

  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;

  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;

  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;

  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;

  GITLAB_CLIENT_ID?: string;
  GITLAB_CLIENT_SECRET?: string;

  // Email Service (Resend)
  RESEND_API_KEY?: string;
  FROM_EMAIL?: string;

  // Webhooks
  WEBHOOK_URL?: string;
  WEBHOOK_SECRET?: string;

  // Stripe Billing Integration
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;

  // SMS Service (Twilio)
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_PHONE_NUMBER?: string;

  // Rate Limiting (Memory / Cloudflare Worker)
  RATE_LIMIT_ENABLED?: string;
  RATE_LIMIT_MAX?: string;
  RATE_LIMIT_WINDOW?: string;
}

export interface Variables {
  db: Database;
  auth: Auth;
  userId?: string;
  sessionId?: string;
  apiKeyId?: string;
  organizationId?: string;
}

export interface AppContext {
  Bindings: Bindings;
  Variables: Variables;
}
