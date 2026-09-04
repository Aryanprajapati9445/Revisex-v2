import { pool } from "../../config/db.js";

/**
 * A comment as the thread renders it. `author_name` is null when the author's
 * account is gone — comments.user_id is ON DELETE SET NULL by deliberate
 * design so a discussion survives someone leaving, which means every consumer
 * has to cope with an authorless row rather than assume a join hit.
 */
export interface CommentView {
  id: string;
  note_id: string;
  user_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  edited: boolean;
}

const COMMENT_SELECT = `
  c.id, c.note_id, c.user_id, c.body, c.created_at, c.updated_at,
  u.full_name AS author_name,
  (c.updated_at > c.created_at) AS edited
`;

function toView(row: Record<string, unknown>): CommentView {
  return {
    id: row.id as string,
    note_id: row.note_id as string,
    user_id: (row.user_id as string | null) ?? null,
    author_name: (row.author_name as string | null) ?? null,
    body: row.body as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    edited: Boolean(row.edited),
  };
}

export async function listComments(
  noteId: string,
  limit: number,
  offset: number
): Promise<{ rows: CommentView[]; total: number }> {
  // Oldest first: a thread reads top to bottom, and idx_comments_note is
  // ordered (note_id, created_at) to serve exactly this.
  const { rows } = await pool.query(
    `SELECT ${COMMENT_SELECT} FROM comments c
     LEFT JOIN users u ON u.id = c.user_id
     WHERE c.note_id = $1
     ORDER BY c.created_at ASC LIMIT $2 OFFSET $3`,
    [noteId, limit, offset]
  );
  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM comments WHERE note_id = $1`,
    [noteId]
  );
  return { rows: rows.map(toView), total: Number(countRows[0]?.count ?? 0) };
}

export async function getCommentById(id: string): Promise<CommentView | null> {
  const { rows } = await pool.query(
    `SELECT ${COMMENT_SELECT} FROM comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
    [id]
  );
  const row = rows[0];
  return row ? toView(row) : null;
}

export async function createComment(noteId: string, userId: string, body: string): Promise<CommentView> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO comments (note_id, user_id, body) VALUES ($1, $2, $3) RETURNING id`,
    [noteId, userId, body]
  );
  // INSERT ... RETURNING always returns exactly one row on success, and the
  // view read-back picks up the author name in the same shape a list returns.
  const created = await getCommentById(rows[0]!.id);
  return created!;
}

export async function updateComment(id: string, body: string): Promise<CommentView | null> {
  const { rowCount } = await pool.query(`UPDATE comments SET body = $1 WHERE id = $2`, [body, id]);
  if ((rowCount ?? 0) === 0) return null;
  return getCommentById(id);
}

export async function deleteComment(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM comments WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
