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
  /** Student-declared. Null until they set it — registration never asks. */
  current_semester: number | null;
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

/**
 * A note as every listing renders it: the note, where it sits in the tree, how
 * the community responded, and this viewer's own relationship to it.
 *
 * The API returns this shape from the note list, note detail, and saved notes,
 * so a card never has to fetch its own subject or program to label itself.
 */
export interface NoteCard extends Note {
  subject_name: string;
  subject_code: string;
  semester: number;
  branch_id: string;
  branch_name: string;
  program_id: string;
  program_name: string;

  rating_avg: number;
  rating_count: number;
  bookmark_count: number;
  comment_count: number;

  /** False/null for a signed-out viewer. */
  viewer_bookmarked: boolean | null;
  viewer_rating: number | null;

  uploader_name: string | null;
  tags: string[];
}

export type NoteSort = "recent" | "top_rated" | "most_downloaded" | "most_saved";

export interface RatingSummary {
  note_id: string;
  rating_avg: number;
  rating_count: number;
  viewer_rating: number | null;
}

export interface NoteComment {
  id: string;
  note_id: string;
  user_id: string | null;
  /** Null when the author's account is gone — the thread outlives them. */
  author_name: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  edited: boolean;
}

export interface Tag {
  id: string;
  name: string;
  note_count: number;
}

/** A viewable link for a file, plus what it takes to choose a viewer for it. */
export interface FilePreview {
  url: string;
  mime_type: string;
  original_filename: string;
  size_bytes: number | null;
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

// --- Administrative views -------------------------------------------------
// The console lists taxonomy rows with the size of the tree under them, which
// the plain Program/Branch/Subject rows above deliberately don't carry: the
// counts cost a subquery each and browse has no use for them. The API only
// serves these to a manager (?with_counts=true).

export interface ProgramWithCounts extends Program {
  branch_count: number;
  subject_count: number;
  note_count: number;
  pending_note_count: number;
  user_count: number;
}

export interface BranchWithCounts extends Branch {
  program_name: string;
  subject_count: number;
  note_count: number;
  pending_note_count: number;
  student_count: number;
}

export interface SubjectWithCounts extends Subject {
  branch_name: string;
  branch_code: string;
  program_id: string;
  program_name: string;
  note_count: number;
  pending_note_count: number;
  file_count: number;
}

/** What a soft delete took out of browse. Shown in the confirm before it runs. */
export interface DeactivationImpact {
  branches?: number;
  subjects?: number;
  notes: number;
}

export interface OverviewBranch {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  subject_count: number;
  note_count: number;
  pending_note_count: number;
  student_count: number;
}

export interface OverviewProgram {
  id: string;
  code: string;
  name: string;
  duration_semesters: number;
  is_active: boolean;
  branch_count: number;
  subject_count: number;
  note_count: number;
  pending_note_count: number;
  user_count: number;
  branches: OverviewBranch[];
}

export interface AdminOverview {
  /** Null/null for a superuser; otherwise the slice these numbers cover. */
  scope: { program_id: string | null; branch_id: string | null };
  totals: {
    programs: number;
    branches: number;
    subjects: number;
    users: number;
    notes: number;
    pending_notes: number;
    approved_notes: number;
    rejected_notes: number;
    files: number;
    downloads: number;
    storage_bytes: number;
    uploads_last_7_days: number;
  };
  programs: OverviewProgram[];
  notes_by_type: { note_type: NoteType; count: number }[];
  recent_activity: {
    id: string;
    title: string;
    status: NoteStatus;
    created_at: string;
    subject_code: string;
    branch_code: string;
    program_code: string;
    uploader_name: string | null;
  }[];
}
