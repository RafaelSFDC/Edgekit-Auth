import { Hono } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import type { AppContext } from "@/types/env";
import { createDb } from "@/db";
import { createAuth } from "@/lib/auth";
import { createCorsMiddleware } from "@/middlewares/cors";
import { errorHandler } from "@/middlewares/error-handler";

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

// Root & Health Check
app.get("/", (c) => {
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

app.get("/health", (c) => {
  return c.json({ status: "healthy", timestamp: new Date().toISOString() });
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

// Mount Better Auth Handler on /api/auth/*
app.all("/api/auth/*", (c) => {
  const auth = c.get("auth");
  return auth.handler(c.req.raw);
});

export default app;
