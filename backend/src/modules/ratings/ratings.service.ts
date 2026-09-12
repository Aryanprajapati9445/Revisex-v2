import { pool } from "../../config/db.js";

export interface NoteRatingSummary {
  note_id: string;
  rating_avg: number;
  rating_count: number;
  viewer_rating: number | null;
}

/**
 * Upsert rather than insert: changing your mind about a note is the same
 * action as rating it, and the composite primary key already says one rating
 * per person per note. The updated_at trigger keeps "when did they last
 * change it" without the application setting it.
 */
export async function rateNote(userId: string, noteId: string, rating: number): Promise<void> {
  await pool.query(
    `INSERT INTO ratings (user_id, note_id, rating) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, note_id) DO UPDATE SET rating = EXCLUDED.rating`,
    [userId, noteId, rating]
  );
}

export async function clearRating(userId: string, noteId: string): Promise<{ removed: boolean }> {
  const { rowCount } = await pool.query(`DELETE FROM ratings WHERE user_id = $1 AND note_id = $2`, [
    userId,
    noteId,
  ]);
  return { removed: (rowCount ?? 0) > 0 };
}

/**
 * Reads the aggregate back through v_note_stats so the number the client shows
 * after rating comes from the same definition the listings use — the client
 * never recomputes an average locally and drifts from the server's.
 */
export async function getRatingSummary(noteId: string, viewerId: string | null): Promise<NoteRatingSummary> {
  const { rows } = await pool.query<{
    rating_avg: string;
    rating_count: string;
    viewer_rating: number | null;
  }>(
    `SELECT st.rating_avg, st.rating_count, vr.rating AS viewer_rating
       FROM v_note_stats st
       LEFT JOIN ratings vr ON vr.note_id = st.note_id AND vr.user_id = $2::uuid
      WHERE st.note_id = $1`,
    [noteId, viewerId]
  );
  const row = rows[0];
  return {
    note_id: noteId,
    rating_avg: Number(row?.rating_avg ?? 0),
    rating_count: Number(row?.rating_count ?? 0),
    viewer_rating: row?.viewer_rating ?? null,
  };
}
