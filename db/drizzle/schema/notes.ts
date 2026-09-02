import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, smallint, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { tsvector } from "./custom-types.js";
import { noteStatusEnum, noteTypeEnum } from "./enums.js";
import { subjects } from "./subjects.js";
import { users } from "./users.js";

// Field keys are snake_case to match DB column names 1:1 — see programs.ts.
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subject_id: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    // Nullable so community content survives an uploader's account being deleted.
    uploader_id: uuid("uploader_id").references(() => users.id, { onDelete: "set null" }),

    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    note_type: noteTypeEnum("note_type").notNull().default("other"),
    // Which exam sitting a PYQ is from; meaningless for other types.
    exam_year: smallint("exam_year"),

    status: noteStatusEnum("status").notNull().default("pending"),
    // Moderation audit: three different role scopes can approve, so record who.
    reviewed_by: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewed_at: timestamp("reviewed_at", { withTimezone: true, mode: "string" }),
    rejection_reason: text("rejection_reason"),

    // Denormalized counter; incrementing beats counting a log per page view.
    download_count: integer("download_count").notNull().default(0),

    created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),

    // Full-text search. The two-argument to_tsvector is required: the
    // one-argument form reads default_text_search_config and is therefore
    // not IMMUTABLE, which a STORED generated column rejects outright. Tag
    // and subject names are NOT searchable here — a generated column can
    // only see its own row.
    search_vector: tsvector("search_vector").generatedAlwaysAs(
      sql`(setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B'))`
    ),
  },
  (table) => [
    check("notes_title_nonempty", sql`length(trim(${table.title})) > 0`),
    check("notes_downloads_sane", sql`${table.download_count} >= 0`),
    check("notes_exam_year_sane", sql`${table.exam_year} is null or ${table.exam_year} between 1950 and 2200`),
    // A moderated note carries its audit trail; a pending one carries none.
    // A rejection must say why, so the uploader can act on it.
    check(
      "notes_review_consistency",
      sql`
        (${table.status} = 'pending'  and ${table.reviewed_by} is null and ${table.reviewed_at} is null and ${table.rejection_reason} is null)
        or (${table.status} = 'approved' and ${table.reviewed_at} is not null and ${table.rejection_reason} is null)
        or (${table.status} = 'rejected' and ${table.reviewed_at} is not null and length(trim(coalesce(${table.rejection_reason}, ''))) > 0)
      `
    ),
    index("idx_notes_subject_status_created").on(table.subject_id, table.status, table.created_at.desc()),
    index("idx_notes_subject_type_status").on(table.subject_id, table.note_type, table.status),
    index("idx_notes_uploader")
      .on(table.uploader_id, table.created_at.desc())
      .where(sql`${table.uploader_id} is not null`),
    // The moderation queue. Partial, because pending is a small slice of the
    // table and the index stays tiny no matter how much approved content
    // accumulates.
    index("idx_notes_pending_queue").on(table.created_at).where(sql`${table.status} = 'pending'`),
    index("idx_notes_popular").on(table.download_count.desc()).where(sql`${table.status} = 'approved'`),
    index("idx_notes_search").using("gin", table.search_vector),
    // Keeps ON DELETE SET NULL on notes.reviewed_by from scanning notes.
    index("idx_notes_reviewer").on(table.reviewed_by).where(sql`${table.reviewed_by} is not null`),
  ]
);

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
