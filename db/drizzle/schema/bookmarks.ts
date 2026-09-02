import { index, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { notes } from "./notes.js";
import { users } from "./users.js";

export const bookmarks = pgTable(
  "bookmarks",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    note_id: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.note_id] }),
    index("idx_bookmarks_note").on(table.note_id),
    // "my bookmarks, most recently saved first"
    index("idx_bookmarks_user_recent").on(table.user_id, table.created_at.desc()),
  ]
);

export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;
