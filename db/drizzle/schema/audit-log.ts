import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { auditOutcomeEnum } from "./enums.js";
import { users } from "./users.js";

// One row per write performed through the admin area. Append-only — nothing
// in the application updates or deletes a row here.
//
// metadata is a free-form JSON snapshot of the change (e.g. { before, after }
// for an update). Callers MUST NOT put password_hash, tokens, or any secret
// in it; recordAudit() (backend/src/lib/audit.ts) is the single call site
// that writes this table, so that rule is enforced in exactly one place.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable + SET NULL so a deleted actor's past actions stay on record,
    // mirroring notes.uploader_id/reviewed_by.
    actor_user_id: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    resource_id: text("resource_id"),
    outcome: auditOutcomeEnum("outcome").notNull(),
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    check("audit_log_action_nonempty", sql`length(trim(${table.action})) > 0`),
    check("audit_log_resource_nonempty", sql`length(trim(${table.resource})) > 0`),
    index("idx_audit_log_created").on(table.created_at),
    index("idx_audit_log_actor").on(table.actor_user_id).where(sql`${table.actor_user_id} is not null`),
    index("idx_audit_log_action").on(table.action),
  ]
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
