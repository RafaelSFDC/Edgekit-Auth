import { Hono } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import type { AppContext } from "@/types/env";
import { createDb } from "@/db";
import { createAuth } from "@/lib/auth";
import { createCorsMiddleware } from "@/middlewares/cors";
import { errorHandler } from "@/middlewares/error-handler";
import { adminRoutes } from "@/routes/admin";
import { setupRoutes } from "@/routes/setup";
import { billingRoutes } from "@/routes/billing";
import { rbacRoutes } from "@/routes/rbac";
import { userRoutes } from "@/routes/users";

const app = new Hono<AppContext>();

// Global Error Handler
app.onError(errorHandler);

// Global CORS Middleware
app.use("*", createCorsMiddleware());

// Inject Database & Better Auth instance into request context
app.use("*", async (c, next) => {
  if (c.env?.DB) {
    c.set("db", createDb(c.env.DB));
  }
  const auth = createAuth(c.env, c.req.raw);
  c.set("auth", auth);
  await next();
});

// Root: Serve React SPA if browser request & ASSETS bound, otherwise return JSON status
app.get("/", async (c) => {
  const accept = c.req.header("accept") || "";
  if (accept.includes("text/html") && c.env?.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.json({
    name: "edgekit-auth",
    engine: "better-auth",
    version: "0.2.0",
    status: "running",
    docs: "/docs",
    authEndpoints: "/api/auth/*",
    jwks: "/.well-known/jwks.json",
  });
});

app.get("/health", async (c) => {
  const start = Date.now();
  let dbStatus = "connected";
  let latencyMs = 0;

  try {
    if (c.env?.DB) {
      await c.env.DB.prepare("SELECT 1 as ping;").first();
      latencyMs = Date.now() - start;
    } else {
      dbStatus = "unbound";
    }
  } catch (err: any) {
    return c.json(
      {
        status: "unhealthy",
        database: "disconnected",
        error: err.message || "Failed to query D1 database",
        timestamp: new Date().toISOString(),
      },
      503
    );
  }

  return c.json({
    status: "healthy",
    database: dbStatus,
    latencyMs,
    timestamp: new Date().toISOString(),
  });
});

// Forward /.well-known/jwks.json directly to Better Auth's JWKS endpoint
app.get("/.well-known/jwks.json", async (c) => {
  const auth = c.get("auth");
  const url = new URL("/api/auth/jwks", c.req.url);
  const req = new Request(url.toString(), {
    method: "GET",
    headers: c.req.raw.headers,
  });
  return auth.handler(req);
});

// Interactive Swagger UI powered by Better Auth OpenAPI specification
app.get("/docs", swaggerUI({ url: "/api/auth/open-api/generate-schema" }));

// Initial Setup & Onboarding Status Endpoints (Publicly accessible before first admin is created)
app.route("/api/setup", setupRoutes);

// Admin Management Custom Endpoints (Protected by Admin Auth Guard)
app.route("/api/admin", adminRoutes);

// RBAC & FGA Management Endpoints (Protected by Super-Admin Guard)
app.route("/api/admin/rbac", rbacRoutes);

// Billing & Subscriptions Endpoints (Stripe integration, checkout, portal, plans)
app.route("/api/billing", billingRoutes);

// Consumer User Self-Service Endpoints (Profile, Preferences, Sessions, Metadata)
app.route("/api/v1/users", userRoutes);
app.route("/api/users", userRoutes);

// Mount Better Auth Handler on /api/auth/*
app.all("/api/auth/*", (c) => {
  const auth = c.get("auth");
  return auth.handler(c.req.raw);
});

// SPA Static Assets Fallback for all other frontend routes
app.get("*", async (c) => {
  if (c.env?.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.notFound();
});

export default app;
