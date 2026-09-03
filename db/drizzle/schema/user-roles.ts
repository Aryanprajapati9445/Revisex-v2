import { pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { roles } from "./roles.js";
import { users } from "./users.js";

// Which admin role(s) a user holds. Many-to-many (not a single column on
// users) so a user can hold more than one admin role later without a schema
// change. Unrelated to users.role/program_id/branch_id, which is a separate
// axis for content-domain scope.
export const userRoles = pgTable(
  "user_roles",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role_id: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    granted_at: timestamp("granted_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.user_id, table.role_id] })]
);

export type UserRoleAssignment = typeof userRoles.$inferSelect;
export type NewUserRoleAssignment = typeof userRoles.$inferInsert;
