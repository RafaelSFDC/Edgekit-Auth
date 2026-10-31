import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Billing Plans (Pricing Tiers & Entitlements)
 * Ex: Free, Starter, Pro, Enterprise
 */
export const billingPlan = sqliteTable("billing_plan", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // "free", "starter", "pro", "enterprise"
  description: text("description"),
  stripeProductId: text("stripe_product_id"),
  stripePriceIdMonthly: text("stripe_price_id_monthly"),
  stripePriceIdYearly: text("stripe_price_id_yearly"),
  priceMonthly: integer("price_monthly").notNull().default(0), // in cents
  priceYearly: integer("price_yearly").notNull().default(0), // in cents
  currency: text("currency").notNull().default("usd"),
  features: text("features"), // JSON array of entitlement strings: ["analytics", "export_pdf", "unlimited_members"]
  limits: text("limits"), // JSON object: {"seats": 10, "storage_gb": 50}
  grantedPermissions: text("granted_permissions"), // JSON array of permission keys granted by the plan
  trialDays: integer("trial_days").default(0),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
});

/**
 * Subscriptions (B2B Organization or B2C User)
 */
export const billingSubscription = sqliteTable("billing_subscription", {
  id: text("id").primaryKey(),
  targetType: text("target_type").notNull(), // "organization" | "user"
  targetId: text("target_id").notNull(), // organizationId or userId
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  planId: text("plan_id")
    .notNull()
    .references(() => billingPlan.id),
  status: text("status").notNull().default("active"), // "active", "trialing", "past_due", "canceled"
  currentPeriodStart: integer("current_period_start", { mode: "timestamp_ms" }),
  currentPeriodEnd: integer("current_period_end", { mode: "timestamp_ms" }),
  trialEndsAt: integer("trial_ends_at", { mode: "timestamp_ms" }),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" }).default(false),
  canceledAt: integer("canceled_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
});

export type BillingPlan = typeof billingPlan.$inferSelect;
export type BillingSubscription = typeof billingSubscription.$inferSelect;
