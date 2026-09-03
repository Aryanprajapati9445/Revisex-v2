import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { citext } from "./custom-types.js";

// Admin-dashboard roles — an axis separate from users.role (which governs
// program/branch content scope, not the admin area). Roles here are DATA: a
// Super Admin creates, renames and re-permissions them at runtime, so new
// roles never require a code change.
//
// is_system marks the four seeded defaults (Super Admin, Admin, Manager,
// Viewer) so the UI can stop them from being deleted out from under the
// permission checks that assume they exist; they may still be renamed and
// re-permissioned like any other row.
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: citext("name").notNull().unique(),
    description: text("description"),
    is_system: boolean("is_system").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [check("roles_name_nonempty", sql`length(trim(${table.name})) > 0`)]
);

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
