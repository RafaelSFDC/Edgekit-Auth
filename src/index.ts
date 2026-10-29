import { Hono } from "hono";
import type { AppContext } from "@/types/env";
import { createDb } from "@/db";
import { createCorsMiddleware } from "@/middlewares/cors";
import { errorHandler } from "@/middlewares/error-handler";
import { jwksRoutes } from "@/modules/jwks/routes";
import { oauthRoutes } from "@/modules/oauth/routes";
import { clientRoutes } from "@/modules/client/routes";
import { backendRoutes } from "@/modules/backend/routes";
import { docsRoutes } from "@/modules/docs";

const app = new Hono<AppContext>();

// Global Error Handler
app.onError(errorHandler);

// Global CORS Middleware
app.use("*", createCorsMiddleware());

// Inject Database into Context
app.use("*", async (c, next) => {
  if (c.env?.DB) {
    c.set("db", createDb(c.env.DB));
  }
  await next();
});

// Root & Health Check
app.get("/", (c) => {
  return c.json({
    name: "hono-auth",
    version: "0.1.0",
    status: "running",
    docs: "/docs",
    jwks: "/.well-known/jwks.json",
  });
});

app.get("/health", (c) => {
  return c.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Mount Routes
app.route("/", jwksRoutes);
app.route("/", oauthRoutes);
app.route("/", clientRoutes);
app.route("/", backendRoutes);
app.route("/", docsRoutes);

export default app;
