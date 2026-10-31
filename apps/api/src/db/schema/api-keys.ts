import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

/**
 * Machine-to-Machine API Keys (Secret Keys)
 * Usadas por backends, microsserviços e scripts para autenticação M2M.
 * Apenas o hash SHA-256 é armazenado; o segredo nunca fica em texto plano.
 */
export const apiKey = sqliteTable("api_key", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull().default("ek_live"),
  keyHash: text("key_hash").notNull().unique(),
  displayKey: text("display_key").notNull(),
  role: text("role").notNull().default("admin"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
  metadata: text("metadata"),
});

export type ApiKey = typeof apiKey.$inferSelect;
export type NewApiKey = typeof apiKey.$inferInsert;
