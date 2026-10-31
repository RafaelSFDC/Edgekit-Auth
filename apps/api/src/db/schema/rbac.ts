import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

/**
 * Atomic Permissions Catalog
 * Ex: "posts:create", "billing:manage", "users:invite", "reports:export"
 */
export const permission = sqliteTable("permission", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("General"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * Roles Catalog (Global and Consumer Application Roles)
 * Ex: "admin", "editor", "moderator", "member"
 */
export const role = sqliteTable("role", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  scope: text("scope").notNull().default("global"), // "global" | "organization"
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * Role to Permission Many-to-Many Mapping
 */
export const rolePermission = sqliteTable("role_permission", {
  id: text("id").primaryKey(),
  roleId: text("role_id")
    .notNull()
    .references(() => role.id, { onDelete: "cascade" }),
  permissionKey: text("permission_key")
    .notNull()
    .references(() => permission.key, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * User Role Assignment (Global or per Organization)
 */
export const userRole = sqliteTable("user_role", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  roleId: text("role_id")
    .notNull()
    .references(() => role.id, { onDelete: "cascade" }),
  organizationId: text("organization_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type Permission = typeof permission.$inferSelect;
export type Role = typeof role.$inferSelect;
export type RolePermission = typeof rolePermission.$inferSelect;
export type UserRole = typeof userRole.$inferSelect;
