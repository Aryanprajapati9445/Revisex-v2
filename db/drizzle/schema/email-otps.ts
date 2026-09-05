import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

// One row per code sent. Old rows for a user are simply superseded (found
// via ORDER BY created_at DESC LIMIT 1 in the query layer), not deleted —
// there's no correctness reason to delete them.
export const emailOtps = pgTable(
  "email_otps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code_hash: text("code_hash").notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    consumed_at: timestamp("consumed_at", { withTimezone: true, mode: "string" }),
    attempts: integer("attempts").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [index("idx_email_otps_user_id").on(table.user_id)]
);

export type EmailOtp = typeof emailOtps.$inferSelect;
export type NewEmailOtp = typeof emailOtps.$inferInsert;
