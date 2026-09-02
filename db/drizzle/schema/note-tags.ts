import { index, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { notes } from "./notes.js";
import { tags } from "./tags.js";

export const noteTags = pgTable(
  "note_tags",
  {
    note_id: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    tag_id: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.note_id, table.tag_id] }),
    index("idx_note_tags_tag").on(table.tag_id),
  ]
);

export type NoteTag = typeof noteTags.$inferSelect;
export type NewNoteTag = typeof noteTags.$inferInsert;
