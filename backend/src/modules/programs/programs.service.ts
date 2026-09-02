import { pool } from "../../config/db.js";
import type { Program } from "../../types/index.js";

const SELECT_COLUMNS = `id, code, name, duration_semesters, is_active, created_at, updated_at`;

export async function listActivePrograms(
  limit: number,
  offset: number
): Promise<{ rows: Program[]; total: number }> {
  const { rows } = await pool.query<Program>(
    `SELECT ${SELECT_COLUMNS} FROM programs WHERE is_active ORDER BY code LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM programs WHERE is_active`
  );
  return { rows, total: Number(countRows[0]?.count ?? 0) };
}

export async function getProgramById(id: string): Promise<Program | null> {
  const { rows } = await pool.query<Program>(
    `SELECT ${SELECT_COLUMNS} FROM programs WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}
