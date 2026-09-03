import { pgEnum } from "drizzle-orm/pg-core";

// Native Postgres enums for lists that are structural (changing them changes
// the authorization model or the moderation flow). Mirrors
// db/migrations/000001_initial_schema.up.sql section 1 exactly.
export const userRoleEnum = pgEnum("user_role", [
  "superuser",
  "program_admin",
  "branch_admin",
  "student",
]);

export const noteTypeEnum = pgEnum("note_type", [
  "lecture_notes",
  "pyq",
  "lab_manual",
  "assignment",
  "book",
  "other",
]);

export const noteStatusEnum = pgEnum("note_status", ["pending", "approved", "rejected"]);

export const fileUploadStatusEnum = pgEnum("file_upload_status", [
  "pending",
  "uploaded",
  "failed",
]);

export const auditOutcomeEnum = pgEnum("audit_outcome", ["success", "failure"]);
