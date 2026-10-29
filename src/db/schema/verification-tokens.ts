import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const verificationTokens = sqliteTable(
  "verification_tokens",
  {
    id: text("id").primaryKey(), // "verif_..."
    identifier: text("identifier").notNull(), // email address
    tokenHash: text("token_hash").notNull(),
    code: text("code"), // 6-digit numeric OTP code
    type: text("type", { enum: ["magic_link", "email_otp"] }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    identifierIdx: index("verif_identifier_idx").on(table.identifier),
  })
);

export type VerificationToken = typeof verificationTokens.$inferSelect;
export type NewVerificationToken = typeof verificationTokens.$inferInsert;
