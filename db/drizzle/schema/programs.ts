import { sql } from "drizzle-orm";
import { boolean, check, pgTable, smallint, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

// Top academic tier (B.Tech, MBA, MCA). Rows, so they can be added or
// removed at runtime. "Remove" means is_active = false so historical notes
// survive.
//
// Field keys are deliberately snake_case (not Drizzle's usual camelCase
// convention) to match the DB column names 1:1 — the API currently
// serializes rows straight to JSON with no DTO-mapping layer, so
// $inferSelect's keys ARE the wire format. Renaming them would silently
// change every response's field casing.
export const programs = pgTable(
  "programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 20 }).notNull().unique(),
    name: varchar("name", { length: 120 }).notNull(),
    // Semester count is per-program: B.Tech is 8, MBA and MCA are 4. Nothing
    // about program length is hardcoded in the schema.
    duration_semesters: smallint("duration_semesters").notNull(),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    check("programs_code_upper", sql`${table.code} = upper(${table.code})`),
    check("programs_code_nonempty", sql`length(trim(${table.code})) > 0`),
    check("programs_duration_sane", sql`${table.duration_semesters} between 1 and 20`),
  ]
);

export type Program = typeof programs.$inferSelect;
export type NewProgram = typeof programs.$inferInsert;
