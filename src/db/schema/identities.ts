import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const identities = sqliteTable(
  "identities",
  {
    id: text("id").primaryKey(), // e.g. "idn_2xxxx"
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // "google", "github", etc.
    providerUserId: text("provider_user_id").notNull(),
    email: text("email"),
    profileData: text("profile_data", { mode: "json" })
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
    providerUserUnique: uniqueIndex("provider_user_idx").on(
      table.provider,
      table.providerUserId
    ),
  })
);

export type Identity = typeof identities.$inferSelect;
export type NewIdentity = typeof identities.$inferInsert;
