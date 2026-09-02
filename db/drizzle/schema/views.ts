import { sql } from "drizzle-orm";
import { bigint, integer, numeric, pgView, smallint, uuid } from "drizzle-orm/pg-core";
import { noteStatusEnum } from "./enums.js";

// Resolves a note up to its branch and program in one hop. Every
// authorization check in the API is "does this note's program/branch match
// the actor's scope?", so it is worth having in exactly one place.
//
// Field keys are snake_case to match column names 1:1 — see programs.ts.
export const vNoteScope = pgView("v_note_scope", {
  note_id: uuid("note_id").notNull(),
  status: noteStatusEnum("status").notNull(),
  uploader_id: uuid("uploader_id"),
  subject_id: uuid("subject_id").notNull(),
  semester: smallint("semester").notNull(),
  branch_id: uuid("branch_id").notNull(),
  program_id: uuid("program_id").notNull(),
}).as(sql`
  select
    n.id         as note_id,
    n.status,
    n.uploader_id,
    s.id         as subject_id,
    s.semester,
    b.id         as branch_id,
    p.id         as program_id
  from notes n
  join subjects s on s.id = n.subject_id
  join branches b on b.id = s.branch_id
  join programs p on p.id = b.program_id
`);

// Ratings are computed on read, per the design. This is the single
// definition of "how a note is scored", so the API never hand-rolls the
// aggregate.
export const vNoteStats = pgView("v_note_stats", {
  note_id: uuid("note_id").notNull(),
  rating_avg: numeric("rating_avg", { precision: 3, scale: 2 }).notNull(),
  rating_count: bigint("rating_count", { mode: "number" }).notNull(),
  bookmark_count: bigint("bookmark_count", { mode: "number" }).notNull(),
  comment_count: bigint("comment_count", { mode: "number" }).notNull(),
  download_count: integer("download_count").notNull(),
}).as(sql`
  select
    n.id as note_id,
    coalesce(r.rating_avg, 0)::numeric(3,2) as rating_avg,
    coalesce(r.rating_count, 0)             as rating_count,
    coalesce(bm.bookmark_count, 0)          as bookmark_count,
    coalesce(c.comment_count, 0)            as comment_count,
    n.download_count
  from notes n
  left join (
    select note_id, avg(rating) as rating_avg, count(*) as rating_count
    from ratings group by note_id
  ) r on r.note_id = n.id
  left join (
    select note_id, count(*) as bookmark_count from bookmarks group by note_id
  ) bm on bm.note_id = n.id
  left join (
    select note_id, count(*) as comment_count from comments group by note_id
  ) c on c.note_id = n.id
`);
