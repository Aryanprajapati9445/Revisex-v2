import { pool } from "../../config/db.js";
import type { PoolClient } from "pg";

export interface TagWithCount {
  id: string;
  name: string;
  note_count: number;
}

/**
 * The tags table carries `tags_name_lower` and `tags_name_trimmed` CHECKs, so
 * a name that reaches Postgres unnormalized is a 422 rather than a tag. Doing
 * it here means "Unit 1", "unit 1" and " UNIT  1 " all land on one tag instead
 * of three near-duplicates a student has to choose between.
 */
export function normalizeTagName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 50).trim();
}

/**
 * Get-or-create, race-safe.
 *
 * A plain SELECT-then-INSERT loses to a concurrent insert on the UNIQUE name.
 * The no-op UPDATE is what makes RETURNING fire on the conflict path too —
 * ON CONFLICT DO NOTHING returns no row, which would leave the caller without
 * an id exactly when two people tag the same thing at once.
 */
async function resolveTagIds(client: PoolClient, names: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const name of names) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO tags (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [name]
    );
    if (rows[0]) ids.push(rows[0].id);
  }
  return ids;
}

/**
 * Replaces a note's tags with exactly this set. One transaction, so a note is
 * never briefly seen with half its tags.
 */
export async function setNoteTags(noteId: string, rawNames: string[]): Promise<string[]> {
  const names = [...new Set(rawNames.map(normalizeTagName).filter((n) => n.length > 0))];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM note_tags WHERE note_id = $1`, [noteId]);

    if (names.length > 0) {
      const tagIds = await resolveTagIds(client, names);
      for (const tagId of tagIds) {
        await client.query(
          `INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [noteId, tagId]
        );
      }
    }

    await client.query("COMMIT");
    return names;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listNoteTags(noteId: string): Promise<string[]> {
  const { rows } = await pool.query<{ name: string }>(
    `SELECT t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
      WHERE nt.note_id = $1 ORDER BY t.name`,
    [noteId]
  );
  return rows.map((r) => r.name);
}

/**
 * Tags worth offering, commonest first.
 *
 * Counts only approved notes: a tag used once on a pending upload would
 * otherwise appear in a public filter list and return nothing when picked.
 */
export async function listTags(q: string | undefined, limit: number): Promise<TagWithCount[]> {
  const params: unknown[] = [];
  let filter = "";
  if (q) {
    params.push(`%${normalizeTagName(q)}%`);
    filter = `WHERE t.name LIKE $${params.length}`;
  }
  params.push(limit);

  const { rows } = await pool.query<{ id: string; name: string; note_count: string }>(
    `SELECT t.id, t.name, COUNT(n.id)::text AS note_count
       FROM tags t
       LEFT JOIN note_tags nt ON nt.tag_id = t.id
       LEFT JOIN notes n ON n.id = nt.note_id AND n.status = 'approved'
       ${filter}
      GROUP BY t.id, t.name
      HAVING COUNT(n.id) > 0
      ORDER BY COUNT(n.id) DESC, t.name ASC
      LIMIT $${params.length}`,
    params
  );
  return rows.map((r) => ({ id: r.id, name: r.name, note_count: Number(r.note_count) }));
}
