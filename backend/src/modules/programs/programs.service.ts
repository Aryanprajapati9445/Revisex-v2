import { pool } from "../../config/db.js";
import type { Program } from "../../types/index.js";

const SELECT_COLUMNS = `id, code, name, duration_semesters, is_active, created_at, updated_at`;

export async function listActivePrograms(): Promise<Program[]> {
  const { rows } = await pool.query<Program>(
    `SELECT ${SELECT_COLUMNS} FROM programs WHERE is_active ORDER BY code`
  );
  return rows;
}

export async function getProgramById(id: string): Promise<Program | null> {
  const { rows } = await pool.query<Program>(
    `SELECT ${SELECT_COLUMNS} FROM programs WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}
