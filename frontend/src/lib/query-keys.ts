import type { NoteStatus, NoteType, UserRole } from "./api-types";

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

  programs: (page = 1) => ["programs", page] as const,
  program: (id: string) => ["program", id] as const,
  branches: (programId: string, page = 1) => ["branches", programId, page] as const,
  subjects: (branchId: string, semester?: number, page = 1) => ["subjects", branchId, semester ?? null, page] as const,

  notes: (filters: NoteFilters) => ["notes", filters] as const,
  note: (id: string) => ["note", id] as const,
  noteFiles: (id: string) => ["note", id, "files"] as const,

  users: (filters: UserFilters) => ["users", filters] as const,
} as const;
