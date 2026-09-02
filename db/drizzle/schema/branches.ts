import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { programs } from "./programs.js";

// A branch within a program (CSE under B.Tech). Code is unique per program,
// so two programs may both have a "CSE".
//
// Field keys are snake_case to match DB column names 1:1 — see programs.ts.
export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    program_id: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 20 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    unique("branches_program_code_key").on(table.program_id, table.code),
    check("branches_code_upper", sql`${table.code} = upper(${table.code})`),
    check("branches_code_nonempty", sql`length(trim(${table.code})) > 0`),
    index("idx_branches_program_active").on(table.program_id).where(sql`${table.is_active}`),
  ]
);

export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;
