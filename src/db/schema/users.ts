import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // e.g. "user_2xxxx"
  primaryEmail: text("primary_email").unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  imageUrl: text("image_url"),
  publicMetadata: text("public_metadata", { mode: "json" }).$type<Record<string, unknown>>().default({}),
  privateMetadata: text("private_metadata", { mode: "json" }).$type<Record<string, unknown>>().default({}),
  banned: integer("banned", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
