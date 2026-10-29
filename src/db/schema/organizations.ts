import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const organizations = sqliteTable(
  "organizations",
  {
    id: text("id").primaryKey(), // e.g. "org_2xxxx"
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logoUrl: text("logo_url"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    publicMetadata: text("public_metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .default({}),
    privateMetadata: text("private_metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    slugIdx: index("org_slug_idx").on(table.slug),
  })
);

export const orgMemberships = sqliteTable(
  "org_memberships",
  {
    id: text("id").primaryKey(), // e.g. "orgmem_2xxxx"
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("org:member"), // "org:admin", "org:member"
    permissions: text("permissions", { mode: "json" })
      .$type<string[]>()
      .default([]),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    orgUserUnique: uniqueIndex("org_user_idx").on(
      table.organizationId,
      table.userId
    ),
  })
);

export const orgInvitations = sqliteTable(
  "org_invitations",
  {
    id: text("id").primaryKey(), // e.g. "inv_2xxxx"
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("org:member"),
    status: text("status", { enum: ["pending", "accepted", "revoked"] })
      .notNull()
      .default("pending"),
    token: text("token").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tokenIdx: uniqueIndex("inv_token_idx").on(table.token),
  })
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type OrgMembership = typeof orgMemberships.$inferSelect;
export type NewOrgMembership = typeof orgMemberships.$inferInsert;
export type OrgInvitation = typeof orgInvitations.$inferSelect;
export type NewOrgInvitation = typeof orgInvitations.$inferInsert;
