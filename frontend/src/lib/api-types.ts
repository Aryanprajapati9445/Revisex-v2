// Mirrors backend/src/types/index.ts, which infers these from the Drizzle
// schema. Wire field names are snake_case; keep them that way.
export type UserRole = "superuser" | "program_admin" | "branch_admin" | "student";
export type NoteType = "lecture_notes" | "pyq" | "lab_manual" | "assignment" | "book" | "other";
export type NoteStatus = "pending" | "approved" | "rejected";
export type FileUploadStatus = "pending" | "uploaded" | "failed";

export interface Program {
  id: string;
  code: string;
  name: string;
  duration_semesters: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  program_id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subject {
  id: string;
  branch_id: string;
  code: string;
  name: string;
  semester: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  program_id: string | null;
  branch_id: string | null;
  enrollment_year: number | null;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  subject_id: string;
  uploader_id: string | null;
  title: string;
  description: string | null;
  note_type: NoteType;
  exam_year: number | null;
  status: NoteStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  download_count: number;
  created_at: string;
  updated_at: string;
}

export interface NoteFile {
  id: string;
  note_id: string;
  s3_bucket: string;
  s3_key: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number | null;
  checksum_sha256: string | null;
  page_count: number | null;
  sort_order: number;
  upload_status: FileUploadStatus;
  uploaded_at: string | null;
  created_at: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface AuthPayload {
  user: User;
  accessToken: string;
  refreshToken: string;
}

// Admin RBAC — a separate axis from UserRole above (see backend/src/types).
export interface Permission {
  id: string;
  description: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  permissions: string[];
}

export type AuditOutcome = "success" | "failure";

export interface AuditLogEntry {
  id: string;
  actor_user_id: string | null;
  action: string;
  resource: string;
  resource_id: string | null;
  outcome: AuditOutcome;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
