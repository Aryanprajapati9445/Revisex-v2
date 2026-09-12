import { pool } from "../config/db.js";
import { ApiError } from "./apiError.js";
import type { AuthUser } from "../middleware/auth.js";
import type { NoteStatus } from "../types/index.js";

/**
 * Where a note sits, plus the facts that decide who may see it. Read in one hop
 * from v_note_scope, which already resolves note -> subject -> branch ->
 * program for exactly this kind of check.
 */
export interface NoteContext {
  noteId: string;
  status: NoteStatus;
  uploaderId: string | null;
  subjectId: string;
  semester: number;
  branchId: string;
  programId: string;
}

/** The subset of a note the visibility rule needs, so a caller holding a full
 *  note row can reuse the rule without re-reading it. */
export interface NoteVisibilityFacts {
  id: string;
  status: NoteStatus;
  uploaderId: string | null;
}

export async function resolveNoteContext(noteId: string): Promise<NoteContext | null> {
  const { rows } = await pool.query<{
    note_id: string;
    status: NoteStatus;
    uploader_id: string | null;
    subject_id: string;
    semester: number;
    branch_id: string;
    program_id: string;
  }>(
    `SELECT note_id, status, uploader_id, subject_id, semester, branch_id, program_id
       FROM v_note_scope WHERE note_id = $1`,
    [noteId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    noteId: row.note_id,
    status: row.status,
    uploaderId: row.uploader_id,
    subjectId: row.subject_id,
    semester: row.semester,
    branchId: row.branch_id,
    programId: row.program_id,
  };
}

/**
 * The one definition of "may this viewer know this note exists".
 *
 * Approved notes are public — browse and search serve signed-out visitors, so
 * `viewer` is legitimately undefined there. Anything else is private to its
 * uploader and to the admins whose scope contains it.
 *
 * `scope` lets a caller that already resolved the note pass it in; without it
 * the branch/program lookup happens only when the answer actually depends on
 * it, which is the uncommon case. An approved note never triggers a query.
 */
async function isVisible(
  viewer: AuthUser | undefined,
  note: NoteVisibilityFacts,
  scope?: { programId: string; branchId: string }
): Promise<boolean> {
  if (note.status === "approved") return true;
  if (!viewer) return false;
  if (note.uploaderId !== null && note.uploaderId === viewer.id) return true;
  if (viewer.role === "superuser") return true;
  if (viewer.role !== "program_admin" && viewer.role !== "branch_admin") return false;

  const resolved = scope ?? (await resolveNoteContext(note.id));
  if (!resolved) return false;
  return viewer.role === "program_admin"
    ? resolved.programId === viewer.programId
    : resolved.branchId === viewer.branchId;
}

/**
 * For a caller that already loaded the note row. 404 rather than 403, matching
 * requireScope: a stranger must not learn a note exists by reading status codes.
 */
export async function assertLoadedNoteVisible(
  viewer: AuthUser | undefined,
  note: NoteVisibilityFacts
): Promise<void> {
  if (!(await isVisible(viewer, note))) {
    throw new ApiError(404, "NOT_FOUND", "Note not found");
  }
}

/**
 * The gate every engagement read goes through.
 *
 * A note id arrives from the client on every bookmark, rating and comment call,
 * so without this a pending note could be bookmarked and then have its title
 * and description read straight back out of the bookmarks list — the same leak
 * class as an unscoped upload.
 */
export async function assertNoteVisible(
  viewer: AuthUser | undefined,
  noteId: string
): Promise<NoteContext> {
  const note = await resolveNoteContext(noteId);
  if (!note) throw new ApiError(404, "NOT_FOUND", "Note not found");

  const facts = { id: note.noteId, status: note.status, uploaderId: note.uploaderId };
  if (!(await isVisible(viewer, facts, { programId: note.programId, branchId: note.branchId }))) {
    throw new ApiError(404, "NOT_FOUND", "Note not found");
  }
  return note;
}

/**
 * The gate every engagement *write* goes through.
 *
 * Stricter than visibility on purpose: an uploader and a moderator can both see
 * a pending note, but neither should be able to bookmark, rate or discuss one.
 * A rating cast on unpublished work would silently carry into the public
 * average the moment it was approved, and a thread on a note that may yet be
 * rejected has nowhere to live. 409 rather than 403 — the caller is permitted,
 * the note is in the wrong state, and it will not always be.
 */
export async function assertNoteEngageable(viewer: AuthUser, noteId: string): Promise<NoteContext> {
  const note = await assertNoteVisible(viewer, noteId);
  if (note.status !== "approved") {
    throw new ApiError(409, "NOTE_NOT_APPROVED", "This note is not approved yet");
  }
  return note;
}
