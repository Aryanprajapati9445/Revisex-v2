import { pool } from "../../config/db.js";
import { NOTE_CARD_COLUMNS, noteCardJoins, toNoteCard, type NoteCard } from "../../lib/noteProjection.js";

/**
 * Saving is idempotent: pressing the bookmark button twice is a person being
 * unsure, not an error, so a second call succeeds and reports that nothing was
 * created. ON CONFLICT DO NOTHING also removes the check-then-insert race
 * between two tabs.
 */
export async function addBookmark(userId: string, noteId: string): Promise<{ created: boolean }> {
  const { rowCount } = await pool.query(
    `INSERT INTO bookmarks (user_id, note_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, noteId]
  );
  return { created: (rowCount ?? 0) > 0 };
}

export async function removeBookmark(userId: string, noteId: string): Promise<{ removed: boolean }> {
  const { rowCount } = await pool.query(`DELETE FROM bookmarks WHERE user_id = $1 AND note_id = $2`, [
    userId,
    noteId,
  ]);
  return { removed: (rowCount ?? 0) > 0 };
}

/**
 * A person's saved notes, most recently saved first.
 *
 * The status filter matters: a note can be approved when it is saved and
 * rejected later, and without this the rejected content would keep showing up
 * in the saver's list. Narrower than the full visibility rule on purpose — an
 * admin's saved list hides their own out-of-scope pending saves rather than
 * widening what a list endpoint can return.
 */
export async function listBookmarks(
  userId: string,
  limit: number,
  offset: number
): Promise<{ rows: NoteCard[]; total: number }> {
  const where = `WHERE bk.user_id = $1::uuid AND (n.status = 'approved' OR n.uploader_id = $1::uuid)`;
  const from = `FROM bookmarks bk JOIN notes n ON n.id = bk.note_id ${noteCardJoins(1)}`;

  const { rows } = await pool.query(
    `SELECT ${NOTE_CARD_COLUMNS} ${from} ${where}
     ORDER BY bk.created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM bookmarks bk JOIN notes n ON n.id = bk.note_id ${where}`,
    [userId]
  );

  return { rows: rows.map(toNoteCard), total: Number(countRows[0]?.count ?? 0) };
}

export async function countBookmarks(userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM bookmarks bk JOIN notes n ON n.id = bk.note_id
      WHERE bk.user_id = $1 AND n.status = 'approved'`,
    [userId]
  );
  return Number(rows[0]?.count ?? 0);
}
