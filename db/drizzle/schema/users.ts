import { sql } from "drizzle-orm";
import { check, index, pgTable, smallint, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { branches } from "./branches.js";
import { citext } from "./custom-types.js";
import { userRoleEnum } from "./enums.js";
import { programs } from "./programs.js";

// Hybrid auth: a row is valid with a password hash, with a federated
// identity, or with both. At least one path must be present
// (users_has_auth_method).
//
// Roles are scoped: a role label alone is not enough, because a program
// admin has to know which program they run (users_role_scope).
//
// Field keys are snake_case to match DB column names 1:1 — see programs.ts.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: citext("email").notNull().unique(),
    full_name: varchar("full_name", { length: 150 }).notNull(),

    password_hash: text("password_hash"),
    auth_provider: varchar("auth_provider", { length: 30 }),
    provider_user_id: text("provider_user_id"),

    role: userRoleEnum("role").notNull().default("student"),
    program_id: uuid("program_id").references(() => programs.id, { onDelete: "restrict" }),
    branch_id: uuid("branch_id").references(() => branches.id, { onDelete: "restrict" }),

    enrollment_year: smallint("enrollment_year"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    check("users_email_format", sql`${table.email} ~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'`),
    check("users_name_nonempty", sql`length(trim(${table.full_name})) > 0`),
    // Every account must be able to authenticate somehow.
    check(
      "users_has_auth_method",
      sql`${table.password_hash} is not null or (${table.auth_provider} is not null and ${table.provider_user_id} is not null)`
    ),
    // A federated identity is both halves or neither.
    check("users_provider_pair", sql`(${table.auth_provider} is null) = (${table.provider_user_id} is null)`),
    check(
      "users_provider_known",
      sql`${table.auth_provider} is null or ${table.auth_provider} in ('google', 'microsoft')`
    ),
    // The scope model from the access-control design, enforced at the DB
    // level:
    //   superuser     -> global, no scope
    //   program_admin -> one program
    //   branch_admin  -> one branch (program derived through it)
    //   student       -> one branch (program derived through it)
    check(
      "users_role_scope",
      sql`
        (${table.role} = 'superuser'     and ${table.program_id} is null     and ${table.branch_id} is null)
        or (${table.role} = 'program_admin' and ${table.program_id} is not null and ${table.branch_id} is null)
        or (${table.role} = 'branch_admin'  and ${table.program_id} is null     and ${table.branch_id} is not null)
        or (${table.role} = 'student'       and ${table.program_id} is null     and ${table.branch_id} is not null)
      `
    ),
    // One account per federated identity. Partial, so the many
    // password-only rows with NULL provider columns do not collide.
    uniqueIndex("users_provider_identity_key")
      .on(table.auth_provider, table.provider_user_id)
      .where(sql`${table.auth_provider} is not null`),
    index("idx_users_branch").on(table.branch_id).where(sql`${table.branch_id} is not null`),
    index("idx_users_program").on(table.program_id).where(sql`${table.program_id} is not null`),
    index("idx_users_role").on(table.role),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
