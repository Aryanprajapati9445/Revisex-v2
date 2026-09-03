import { pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { permissions } from "./permissions.js";
import { roles } from "./roles.js";

// A role's permission set. A Super Admin edits this table directly (add/drop
// rows) to change what a role may do — no code path branches on role name.
export const rolePermissions = pgTable(
  "role_permissions",
  {
    role_id: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permission_id: text("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "restrict" }),
  },
  (table) => [primaryKey({ columns: [table.role_id, table.permission_id] })]
);

export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;
