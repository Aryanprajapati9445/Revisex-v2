import type { NoteSort, NoteStatus, NoteType, UserRole } from "./api-types";

/** Mirrors the backend's own default page size (lib/pagination.ts). */
export const DEFAULT_LIMIT = 20;

/**
 * Page size for select/dropdown pickers, which must show every option rather
 * than a first page. 100 is the backend's maximum accepted limit.
 */
export const PICKER_LIMIT = 100;

export interface NoteFilters {
  subject_id?: string;
  /** Everything in a branch, across its subjects — what a student's home asks for. */
  branch_id?: string;
  semester?: number;
  note_type?: NoteType;
  status?: NoteStatus;
  tag?: string;
  uploader_id?: string;
  q?: string;
  sort?: NoteSort;
  page?: number;
  limit?: number;
}

export interface UserFilters {
  role?: UserRole;
  branch_id?: string;
  /** Free-text over name and email, matched client-side within the page. */
  q?: string;
  page?: number;
  limit?: number;
}

/**
 * Filters for the administrative taxonomy lists. `include_inactive` and
 * `with_counts` are the two flags that turn a public browse request into the
 * manager view, so they belong in the key: the same path with and without them
 * returns genuinely different rows.
 */
export interface TaxonomyFilters {
  program_id?: string;
  branch_id?: string;
  semester?: number;
  q?: string;
  include_inactive?: boolean;
  page?: number;
  limit?: number;
}

export interface AuditLogFilters {
  actor_user_id?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export const queryKeys = {
  me: ["me"] as const,

  // limit is part of the key: a picker asking for 100 rows and a paged list
  // asking for 20 are different results, and sharing a key would let whichever
  // resolved first serve the other a truncated or oversized page.
  programs: (page = 1, limit = DEFAULT_LIMIT) => ["programs", page, limit] as const,
  program: (id: string) => ["program", id] as const,
  branch: (id: string) => ["branch", id] as const,
  subject: (id: string) => ["subject", id] as const,
  branches: (programId: string, page = 1, limit = DEFAULT_LIMIT) =>
    ["branches", programId, page, limit] as const,
  subjects: (branchId: string, semester?: number, page = 1, limit = DEFAULT_LIMIT) =>
    ["subjects", branchId, semester ?? null, page, limit] as const,

  notes: (filters: NoteFilters) => ["notes", filters] as const,

  // The public landing page reads only counts (pagination.total) off the same
  // unauthenticated list endpoints the app already exposes — no new backend
  // route. Kept out of the scoped `programs`/`branches`/`subjects` keys above
  // since these are unfiltered, limit=1 requests purely for their totals.
  landingStats: ["landing", "stats"] as const,
  landingPrograms: (limit: number) => ["landing", "programs", limit] as const,
  note: (id: string) => ["note", id] as const,
  noteFiles: (id: string) => ["note", id, "files"] as const,
  filePreview: (noteId: string, fileId: string) => ["note", noteId, "files", fileId, "preview"] as const,

  // Engagement. Comments and bookmarks are paginated lists in their own right;
  // a rating is a per-note summary the note query also carries, so writing one
  // invalidates both.
  bookmarks: (page = 1, limit = DEFAULT_LIMIT) => ["bookmarks", page, limit] as const,
  comments: (noteId: string, page = 1) => ["comments", noteId, page] as const,
  tags: (q?: string) => ["tags", q ?? null] as const,

  users: (filters: UserFilters) => ["users", filters] as const,

  // Admin RBAC — a separate axis from the users/programs/branches keys above.
  myPermissions: ["admin", "permissions", "me"] as const,
  permissionsCatalog: ["admin", "permissions"] as const,
  roles: ["admin", "roles"] as const,
  role: (id: string) => ["admin", "roles", id] as const,
  userRoles: (userId: string) => ["admin", "users", userId, "roles"] as const,
  adminUsers: (filters: UserFilters) => ["admin", "users", filters] as const,
  auditLog: (filters: AuditLogFilters) => ["admin", "audit-log", filters] as const,

  // Console — the manager view of the same tables the browse keys above read.
  // Kept under an "admin" prefix so one invalidate after a taxonomy write
  // refreshes every console list without touching the browse cache, which is
  // scoped differently and would otherwise refetch for no reason.
  overview: ["admin", "overview"] as const,
  adminPrograms: (filters: TaxonomyFilters) => ["admin", "taxonomy", "programs", filters] as const,
  adminBranches: (filters: TaxonomyFilters) => ["admin", "taxonomy", "branches", filters] as const,
  adminSubjects: (filters: TaxonomyFilters) => ["admin", "taxonomy", "subjects", filters] as const,
  adminTaxonomy: ["admin", "taxonomy"] as const,
} as const;
