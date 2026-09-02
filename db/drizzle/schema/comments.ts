import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { notes } from "./notes.js";
import { users } from "./users.js";

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    note_id: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    // Nullable so a thread stays readable after its author leaves.
    user_id: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    check("comments_body_nonempty", sql`length(trim(${table.body})) > 0`),
    // Comment thread for a note, oldest first.
    index("idx_comments_note").on(table.note_id, table.created_at),
    index("idx_comments_user").on(table.user_id).where(sql`${table.user_id} is not null`),
  ]
);

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
