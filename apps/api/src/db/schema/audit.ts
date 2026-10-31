import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Audit Log / Activity Trail
 * Registra eventos críticos de segurança e ações administrativas.
 */
export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  actorId: text("actor_id"),
  actorEmail: text("actor_email"),
  actorType: text("actor_type").notNull().default("user"),
  targetId: text("target_id"),
  targetType: text("target_type"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
