import { sql } from "drizzle-orm";
import { check, index, pgTable, primaryKey, smallint, timestamp, uuid } from "drizzle-orm/pg-core";
import { notes } from "./notes.js";
import { users } from "./users.js";

// One rating per user per note, enforced by the composite primary key.
export const ratings = pgTable(
  "ratings",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    note_id: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    rating: smallint("rating").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.note_id] }),
    check("ratings_range", sql`${table.rating} between 1 and 5`),
    index("idx_ratings_note").on(table.note_id),
  ]
);

export type Rating = typeof ratings.$inferSelect;
export type NewRating = typeof ratings.$inferInsert;
