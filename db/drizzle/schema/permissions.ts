import { sql } from "drizzle-orm";
import { check, pgTable, text } from "drizzle-orm/pg-core";

// A fixed catalog, not user-editable: what an admin role CAN be granted.
// Application code is the source of truth for which permissions exist — this
// table only needs a new row (seed data, no code change) when a new
// permission is introduced. `id` is the permission key itself
// ("users.read", "roles.manage", ...), used directly by requirePermission().
export const permissions = pgTable(
  "permissions",
  {
    id: text("id").primaryKey(),
    description: text("description").notNull(),
  },
  (table) => [
    check("permissions_id_format", sql`${table.id} ~ '^[a-z]+\\.[a-z]+$'`),
    check("permissions_description_nonempty", sql`length(trim(${table.description})) > 0`),
  ]
);

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
