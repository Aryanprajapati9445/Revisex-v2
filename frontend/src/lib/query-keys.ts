import type { NoteStatus, NoteType, UserRole } from "./api-types";

/** Mirrors the backend's own default page size (lib/pagination.ts). */
export const DEFAULT_LIMIT = 20;

/**
 * Page size for select/dropdown pickers, which must show every option rather
 * than a first page. 100 is the backend's maximum accepted limit.
 */
export const PICKER_LIMIT = 100;

export interface NoteFilters {
  subject_id?: string;
  note_type?: NoteType;
  status?: NoteStatus;
  q?: string;
  page?: number;
  limit?: number;
}

export interface UserFilters {
  role?: UserRole;
  branch_id?: string;
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
  branches: (programId: string, page = 1, limit = DEFAULT_LIMIT) =>
    ["branches", programId, page, limit] as const,
  subjects: (branchId: string, semester?: number, page = 1, limit = DEFAULT_LIMIT) =>
    ["subjects", branchId, semester ?? null, page, limit] as const,

  notes: (filters: NoteFilters) => ["notes", filters] as const,
  note: (id: string) => ["note", id] as const,
  noteFiles: (id: string) => ["note", id, "files"] as const,

  users: (filters: UserFilters) => ["users", filters] as const,
} as const;
