import { sql } from "drizzle-orm";
import { bigint, char, check, index, integer, pgTable, smallint, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { fileUploadStatusEnum } from "./enums.js";
import { notes } from "./notes.js";

// One row per S3 object. A note can bundle several files (scanned pages, a
// question paper plus its solution), ordered by sort_order.
//
// upload_status exists because of the presigned-URL flow: the row is
// created before the client has finished PUTting to S3. Without it the
// database cannot tell an abandoned upload from a real file.
//
// Field keys are snake_case to match DB column names 1:1 — see programs.ts.
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    note_id: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),

    s3_bucket: varchar("s3_bucket", { length: 63 }).notNull(),
    s3_key: text("s3_key").notNull().unique(),

    original_filename: varchar("original_filename", { length: 255 }).notNull(),
    mime_type: varchar("mime_type", { length: 120 }).notNull(),
    size_bytes: bigint("size_bytes", { mode: "number" }),
    // Lets the app detect a re-upload of an identical file across notes.
    checksum_sha256: char("checksum_sha256", { length: 64 }),
    page_count: integer("page_count"),
    sort_order: smallint("sort_order").notNull().default(0),

    upload_status: fileUploadStatusEnum("upload_status").notNull().default("pending"),
    uploaded_at: timestamp("uploaded_at", { withTimezone: true, mode: "string" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    check("files_size_sane", sql`${table.size_bytes} is null or ${table.size_bytes} > 0`),
    check("files_pages_sane", sql`${table.page_count} is null or ${table.page_count} > 0`),
    check("files_sort_sane", sql`${table.sort_order} >= 0`),
    check("files_checksum_hex", sql`${table.checksum_sha256} is null or ${table.checksum_sha256} ~ '^[0-9a-f]{64}$'`),
    // A file only counts as uploaded once S3 has confirmed size and time.
    check(
      "files_upload_complete",
      sql`${table.upload_status} <> 'uploaded' or (${table.size_bytes} is not null and ${table.uploaded_at} is not null)`
    ),
    // NOTE: this constraint is DEFERRABLE INITIALLY IMMEDIATE in the real
    // database (a reorder can shuffle sort_order inside one transaction
    // without tripping it halfway through) — drizzle-orm's unique-constraint
    // builder has no DEFERRABLE option, so that property is applied by a
    // hand-written custom migration instead and is NOT represented here.
    // See db/drizzle/migrations/0001_procedural_logic.sql.
    unique("files_note_order_key").on(table.note_id, table.sort_order),
    // Sweeping abandoned presigned uploads.
    index("idx_files_stale_uploads").on(table.created_at).where(sql`${table.upload_status} = 'pending'`),
    // Cross-note duplicate detection.
    index("idx_files_checksum").on(table.checksum_sha256).where(sql`${table.checksum_sha256} is not null`),
  ]
);

export type NoteFile = typeof files.$inferSelect;
export type NewNoteFile = typeof files.$inferInsert;
