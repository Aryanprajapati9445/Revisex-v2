import { pool } from "../../config/db.js";
import { ApiError } from "../../lib/apiError.js";
import type { AuthUser } from "../../middleware/auth.js";
import type { Note, NoteType, NoteStatus, NoteFile } from "../../types/index.js";
import { buildNoteFileKey, getPresignedGetUrl, getPresignedPutUrl } from "../../lib/s3.js";
import { env } from "../../config/env.js";
import { isCheckViolation, isForeignKeyViolation } from "../../lib/pgError.js";

const NOTE_COLUMNS = `id, subject_id, uploader_id, title, description, note_type, exam_year,
  status, reviewed_by, reviewed_at, rejection_reason, download_count, created_at, updated_at`;
const NOTE_COLUMNS_ALIASED = NOTE_COLUMNS.split(",")
  .map((c) => `n.${c.trim()}`)
  .join(", ");

export interface CreateNoteInput {
  subject_id: string;
  title: string;
  description: string | null;
  note_type: NoteType;
  exam_year: number | null;
}

export async function createNote(uploaderId: string, input: CreateNoteInput): Promise<Note> {
  try {
    const { rows } = await pool.query<Note>(
      `INSERT INTO notes (subject_id, uploader_id, title, description, note_type, exam_year)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${NOTE_COLUMNS}`,
      [input.subject_id, uploaderId, input.title, input.description, input.note_type, input.exam_year]
    );
    // INSERT ... RETURNING always returns exactly one row on success.
    return rows[0]!;
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw new ApiError(422, "VALIDATION_ERROR", "subject_id does not reference an existing subject");
    }
    if (isCheckViolation(err)) {
      throw new ApiError(422, "VALIDATION_ERROR", "The submitted data does not meet the required constraints");
    }
    throw err;
  }
}

export interface NoteFilters {
  subject_id?: string;
  note_type?: NoteType;
  status?: NoteStatus;
  q?: string;
}

export interface ListNotesOptions {
  filters: NoteFilters;
  viewer: AuthUser;
}

export async function listNotes(
  options: ListNotesOptions,
  limit: number,
  offset: number
): Promise<{ rows: Note[]; total: number }> {
  const { filters, viewer } = options;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let joinBranches = false;

  const status = filters.status ?? "approved";
  params.push(status);
  conditions.push(`n.status = $${params.length}`);

  if (status !== "approved") {
    if (viewer.role === "superuser") {
      // no extra restriction — superuser sees every status everywhere
    } else if (viewer.role === "program_admin") {
      joinBranches = true;
      params.push(viewer.programId);
      conditions.push(`b.program_id = $${params.length}`);
    } else if (viewer.role === "branch_admin") {
      joinBranches = true;
      params.push(viewer.branchId);
      conditions.push(`b.id = $${params.length}`);
    } else {
      params.push(viewer.id);
      conditions.push(`n.uploader_id = $${params.length}`);
    }
  }

  if (filters.subject_id) {
    params.push(filters.subject_id);
    conditions.push(`n.subject_id = $${params.length}`);
  }
  if (filters.note_type) {
    params.push(filters.note_type);
    conditions.push(`n.note_type = $${params.length}`);
  }
  if (filters.q) {
    params.push(filters.q);
    conditions.push(`n.search_vector @@ plainto_tsquery('english', $${params.length})`);
  }

  const joinClause = joinBranches
    ? `JOIN subjects s ON s.id = n.subject_id JOIN branches b ON b.id = s.branch_id`
    : "";
  const where = `WHERE ${conditions.join(" AND ")}`;

  const { rows } = await pool.query<Note>(
    `SELECT ${NOTE_COLUMNS_ALIASED} FROM notes n ${joinClause} ${where}
     ORDER BY n.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM notes n ${joinClause} ${where}`,
    params
  );
  // COUNT(*) always returns exactly one row; ?? 0 satisfies noUncheckedIndexedAccess.
  return { rows, total: Number(countRows[0]?.count ?? 0) };
}

export async function getNoteById(id: string): Promise<Note | null> {
  const { rows } = await pool.query<Note>(`SELECT ${NOTE_COLUMNS} FROM notes WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getNoteScope(id: string): Promise<{ programId: string; branchId: string } | null> {
  const { rows } = await pool.query<{ program_id: string; branch_id: string }>(
    `SELECT program_id, branch_id FROM v_note_scope WHERE note_id = $1`,
    [id]
  );
  const row = rows[0];
  return row ? { programId: row.program_id, branchId: row.branch_id } : null;
}

export interface UpdateNoteInput {
  title?: string;
  description?: string | null;
  note_type?: NoteType;
  exam_year?: number | null;
}

export async function updateNote(id: string, input: UpdateNoteInput): Promise<Note | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  if (sets.length === 0) return getNoteById(id);
  params.push(id);
  try {
    const { rows } = await pool.query<Note>(
      `UPDATE notes SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING ${NOTE_COLUMNS}`,
      params
    );
    return rows[0] ?? null;
  } catch (err) {
    if (isCheckViolation(err)) {
      throw new ApiError(422, "VALIDATION_ERROR", "The submitted data does not meet the required constraints");
    }
    throw err;
  }
}

export async function deleteNote(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM notes WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

const FILE_COLUMNS = `id, note_id, s3_bucket, s3_key, original_filename, mime_type, size_bytes,
  checksum_sha256, page_count, sort_order, upload_status, uploaded_at, created_at`;

export interface RequestFileInput {
  original_filename: string;
  mime_type: string;
}

export async function createPendingFiles(
  noteId: string,
  files: RequestFileInput[]
): Promise<Array<{ file: NoteFile; putUrl: string }>> {
  const results: Array<{ file: NoteFile; putUrl: string }> = [];
  for (const [index, f] of files.entries()) {
    const key = buildNoteFileKey(noteId, f.original_filename);
    const { rows } = await pool.query<NoteFile>(
      `INSERT INTO files (note_id, s3_bucket, s3_key, original_filename, mime_type, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${FILE_COLUMNS}`,
      [noteId, env.AWS_S3_BUCKET, key, f.original_filename, f.mime_type, index]
    );
    // INSERT ... RETURNING always returns exactly one row on success.
    const file = rows[0]!;
    const putUrl = await getPresignedPutUrl(key, f.mime_type);
    results.push({ file, putUrl });
  }
  return results;
}

export async function getFileById(fileId: string): Promise<NoteFile | null> {
  const { rows } = await pool.query<NoteFile>(`SELECT ${FILE_COLUMNS} FROM files WHERE id = $1`, [fileId]);
  return rows[0] ?? null;
}

export async function completeFileUpload(fileId: string, sizeBytes: number): Promise<NoteFile | null> {
  const { rows } = await pool.query<NoteFile>(
    `UPDATE files SET upload_status = 'uploaded', size_bytes = $1, uploaded_at = now()
     WHERE id = $2 AND upload_status = 'pending' RETURNING ${FILE_COLUMNS}`,
    [sizeBytes, fileId]
  );
  return rows[0] ?? null;
}

export async function getDownloadUrl(s3Key: string): Promise<string> {
  return getPresignedGetUrl(s3Key);
}

export async function incrementDownloadCount(noteId: string): Promise<void> {
  await pool.query(`UPDATE notes SET download_count = download_count + 1 WHERE id = $1`, [noteId]);
}

export async function reviewNote(
  id: string,
  reviewerId: string,
  decision: "approved" | "rejected",
  rejectionReason: string | null
): Promise<Note | null> {
  const { rows } = await pool.query<Note>(
    `UPDATE notes
     SET status = $1, reviewed_by = $2, reviewed_at = now(), rejection_reason = $3
     WHERE id = $4
     RETURNING ${NOTE_COLUMNS}`,
    [decision, reviewerId, decision === "rejected" ? rejectionReason : null, id]
  );
  return rows[0] ?? null;
}

export async function listNoteFiles(noteId: string): Promise<NoteFile[]> {
  const { rows } = await pool.query<NoteFile>(
    `SELECT ${FILE_COLUMNS} FROM files
     WHERE note_id = $1 AND upload_status = 'uploaded'
     ORDER BY sort_order, created_at`,
    [noteId]
  );
  return rows;
}
