import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Singleton installation-wide settings
 */
export const installationSettings = sqliteTable("installation_settings", {
  id: text("id").primaryKey(), // "default"
  instanceName: text("instance_name").notNull().default("Edgekit Auth"),
  billingTargetMode: text("billing_target_mode").notNull().default("both"), // "organization" | "user" | "both"
  allowUserOrgCreation: integer("allow_user_org_creation", { mode: "boolean" }).notNull().default(true),
  defaultOrgMaxMembers: integer("default_org_max_members").default(5),
  allowSelfSignup: integer("allow_self_signup", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
});

/**
 * Registered webhook endpoints for real-time lifecycle dispatching
 */
export const webhookEndpoint = sqliteTable("webhook_endpoint", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  description: text("description"),
  events: text("events").notNull().default("[]"), // JSON string array: ["*"] or ["user.created", "organization.*"]
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
});

export type InstallationSettings = typeof installationSettings.$inferSelect;
export type NewInstallationSettings = typeof installationSettings.$inferInsert;
export type WebhookEndpoint = typeof webhookEndpoint.$inferSelect;
export type NewWebhookEndpoint = typeof webhookEndpoint.$inferInsert;
