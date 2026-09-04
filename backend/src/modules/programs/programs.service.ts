import { and, asc, count, eq } from "drizzle-orm";
import { pool } from "../../config/db.js";
import { db, schema } from "../../db/index.js";
import { ApiError } from "../../lib/apiError.js";
import { isCheckViolation, isUniqueViolation } from "../../lib/pgError.js";
import type { Program } from "../../types/index.js";

export async function listActivePrograms(
  limit: number,
  offset: number
): Promise<{ rows: Program[]; total: number }> {
  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(schema.programs)
      .where(eq(schema.programs.is_active, true))
      .orderBy(asc(schema.programs.code))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(schema.programs).where(eq(schema.programs.is_active, true)),
  ]);
  // count() always returns exactly one row.
  return { rows, total: countRows[0]!.total };
}

// is_active = false is a soft delete ("Remove means is_active = false so
// historical notes survive"). A deactivated row is hidden from browse, so
// resolving it by id would let a direct URL walk straight back into it.
export async function getProgramById(id: string): Promise<Program | null> {
  const [row] = await db
    .select()
    .from(schema.programs)
    .where(and(eq(schema.programs.id, id), eq(schema.programs.is_active, true)))
    .limit(1);
  return row ?? null;
}

/**
 * The management counterpart to getProgramById: reaches soft-removed rows too.
 * Without it a deactivated program could never be edited or restored, because
 * every read path filters is_active = true.
 */
export async function getProgramByIdIncludingInactive(id: string): Promise<Program | null> {
  const [row] = await db.select().from(schema.programs).where(eq(schema.programs.id, id)).limit(1);
  return row ?? null;
}

/** A program row plus the size of the tree hanging off it. */
export interface ProgramWithCounts extends Program {
  branch_count: number;
  subject_count: number;
  note_count: number;
  pending_note_count: number;
  user_count: number;
}

export interface ListProgramsOptions {
  includeInactive?: boolean;
  /** Free-text match on code or name. */
  q?: string;
  /** A program_admin sees only their own program. */
  programScopeId?: string;
}

/**
 * One query per page instead of N+1 count round-trips from the client: the
 * admin console shows branch/subject/note totals against every program row, so
 * the counts are aggregated in SQL as correlated subqueries.
 */
export async function listProgramsWithCounts(
  options: ListProgramsOptions,
  limit: number,
  offset: number
): Promise<{ rows: ProgramWithCounts[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (!options.includeInactive) conditions.push(`p.is_active`);
  if (options.programScopeId) {
    params.push(options.programScopeId);
    conditions.push(`p.id = $${params.length}`);
  }
  if (options.q) {
    params.push(`%${options.q}%`);
    conditions.push(`(p.name ILIKE $${params.length} OR p.code ILIKE $${params.length})`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query<ProgramWithCounts>(
    `SELECT p.*,
            (SELECT COUNT(*)::int FROM branches b WHERE b.program_id = p.id) AS branch_count,
            (SELECT COUNT(*)::int FROM subjects s
               JOIN branches b ON b.id = s.branch_id WHERE b.program_id = p.id) AS subject_count,
            (SELECT COUNT(*)::int FROM notes n
               JOIN subjects s ON s.id = n.subject_id
               JOIN branches b ON b.id = s.branch_id WHERE b.program_id = p.id) AS note_count,
            (SELECT COUNT(*)::int FROM notes n
               JOIN subjects s ON s.id = n.subject_id
               JOIN branches b ON b.id = s.branch_id
              WHERE b.program_id = p.id AND n.status = 'pending') AS pending_note_count,
            (SELECT COUNT(*)::int FROM users u
              WHERE u.program_id = p.id
                 OR u.branch_id IN (SELECT id FROM branches WHERE program_id = p.id)) AS user_count
       FROM programs p ${where}
      ORDER BY p.is_active DESC, p.code ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM programs p ${where}`,
    params
  );
  return { rows, total: Number(countRows[0]?.count ?? 0) };
}

export interface CreateProgramInput {
  code: string;
  name: string;
  duration_semesters: number;
}

function rethrowProgramWriteError(err: unknown): never {
  if (isUniqueViolation(err)) {
    throw new ApiError(409, "CONFLICT", "A program with that code already exists");
  }
  if (isCheckViolation(err)) {
    // programs_code_upper / _nonempty / _duration_sane — the API validates the
    // same rules up front, so reaching here means a case the schema is stricter about.
    throw new ApiError(422, "VALIDATION_ERROR", "The submitted program does not meet the required constraints");
  }
  throw err;
}

export async function createProgram(input: CreateProgramInput): Promise<Program> {
  try {
    const [row] = await db.insert(schema.programs).values(input).returning();
    // INSERT ... RETURNING always returns exactly one row on success.
    return row!;
  } catch (err) {
    rethrowProgramWriteError(err);
  }
}

export interface UpdateProgramInput {
  code?: string;
  name?: string;
  duration_semesters?: number;
  is_active?: boolean;
}

export async function updateProgram(id: string, input: UpdateProgramInput): Promise<Program | null> {
  if (Object.keys(input).length === 0) return getProgramByIdIncludingInactive(id);
  try {
    const [row] = await db.update(schema.programs).set(input).where(eq(schema.programs.id, id)).returning();
    return row ?? null;
  } catch (err) {
    rethrowProgramWriteError(err);
  }
}

export interface DeactivationImpact {
  branches: number;
  subjects: number;
  notes: number;
}

/**
 * Deactivating a program cascades to its branches and subjects, in one
 * transaction. The FKs are `onDelete: "restrict"` and nothing in the database
 * cascades is_active, so without this a program could be hidden from browse
 * while its subjects stayed reachable through a direct /subjects?branch_id=
 * call. Notes are deliberately left alone — they keep their own status, and a
 * restore must not silently republish them.
 */
export async function deactivateProgramCascade(id: string): Promise<DeactivationImpact> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const subjects = await client.query(
      `UPDATE subjects SET is_active = false
        WHERE is_active AND branch_id IN (SELECT id FROM branches WHERE program_id = $1)`,
      [id]
    );
    const branches = await client.query(
      `UPDATE branches SET is_active = false WHERE is_active AND program_id = $1`,
      [id]
    );
    const notes = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM notes n
         JOIN subjects s ON s.id = n.subject_id
         JOIN branches b ON b.id = s.branch_id
        WHERE b.program_id = $1`,
      [id]
    );
    await client.query(`UPDATE programs SET is_active = false WHERE id = $1`, [id]);
    await client.query("COMMIT");
    return {
      branches: branches.rowCount ?? 0,
      subjects: subjects.rowCount ?? 0,
      notes: Number(notes.rows[0]?.count ?? 0),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
