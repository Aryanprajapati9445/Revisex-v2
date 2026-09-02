import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, smallint, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { branches } from "./branches.js";

// A subject offered by a branch in a given semester. Program is derived
// through the branch, never stored twice.
//
// Field keys are snake_case to match DB column names 1:1 — see programs.ts.
//
// The per-program semester ceiling ("MBA has 4 semesters") is enforced by
// the `subjects_check_semester_trg` trigger from
// db/migrations/000001_initial_schema.up.sql — a CHECK cannot read another
// table, so that rule cannot be expressed in this schema DSL at all. It
// lives in a hand-written custom migration instead; see
// db/drizzle/migrations/0001_procedural_logic.sql.
export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 20 }).notNull(),
    name: varchar("name", { length: 150 }).notNull(),
    semester: smallint("semester").notNull(),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    // Scoped per branch to mirror branches.code. A globally unique subject
    // code would stop two branches from ever offering the same-coded subject.
    unique("subjects_branch_code_key").on(table.branch_id, table.code),
    check("subjects_code_upper", sql`${table.code} = upper(${table.code})`),
    check("subjects_semester_min", sql`${table.semester} >= 1`),
    index("idx_subjects_branch_semester").on(table.branch_id, table.semester).where(sql`${table.is_active}`),
  ]
);

export type Subject = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;
