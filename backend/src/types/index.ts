// Row shapes are inferred from the Drizzle schema (db/drizzle/schema/) —
// the single source of truth. No hand-written interface here is allowed to
// duplicate a table's column shape; if it needs to change, change the
// Drizzle schema and re-run `npm run build` in db/.
import type {
  files,
  notes,
  programs,
  subjects,
  users,
  branches as branchesTable,
  fileUploadStatusEnum,
  noteStatusEnum,
  noteTypeEnum,
  userRoleEnum,
  auditOutcomeEnum,
  permissions,
  roles,
  rolePermissions,
  userRoles,
  auditLog,
} from "../../../db/dist/schema/index.js";

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type NoteType = (typeof noteTypeEnum.enumValues)[number];
export type NoteStatus = (typeof noteStatusEnum.enumValues)[number];
export type FileUploadStatus = (typeof fileUploadStatusEnum.enumValues)[number];
export type AuditOutcome = (typeof auditOutcomeEnum.enumValues)[number];

export type Program = typeof programs.$inferSelect;
export type Branch = typeof branchesTable.$inferSelect;
export type Subject = typeof subjects.$inferSelect;

// password_hash is intentionally omitted — never send it past the DB layer.
export type User = Omit<typeof users.$inferSelect, "password_hash">;

export type Note = typeof notes.$inferSelect;
export type NoteFile = typeof files.$inferSelect;

// Admin RBAC — a separate axis from UserRole/Program/Branch scope above.
export type Permission = typeof permissions.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type UserRoleAssignment = typeof userRoles.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
