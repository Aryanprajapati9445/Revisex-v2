import { and, asc, count, eq } from "drizzle-orm";
import { pool } from "../../config/db.js";
import { db, schema } from "../../db/index.js";
import { ApiError } from "../../lib/apiError.js";
import { isCheckViolation, isForeignKeyViolation, isUniqueViolation } from "../../lib/pgError.js";
import type { Branch } from "../../types/index.js";

export async function listActiveBranches(
  programId: string,
  limit: number,
  offset: number
): Promise<{ rows: Branch[]; total: number }> {
  const where = and(eq(schema.branches.program_id, programId), eq(schema.branches.is_active, true));

  const [rows, countRows] = await Promise.all([
    db.select().from(schema.branches).where(where).orderBy(asc(schema.branches.code)).limit(limit).offset(offset),
    db.select({ total: count() }).from(schema.branches).where(where),
  ]);
  // count() always returns exactly one row.
  return { rows, total: countRows[0]!.total };
}

// Soft-removed branches (is_active = false) stay hidden here too, so the
// detail route cannot resolve what the list route deliberately omits.
export async function getBranchById(id: string): Promise<Branch | null> {
  const [row] = await db
    .select()
    .from(schema.branches)
    .where(and(eq(schema.branches.id, id), eq(schema.branches.is_active, true)))
    .limit(1);
  return row ?? null;
}

/** Management counterpart to getBranchById — see programs.service.ts. */
export async function getBranchByIdIncludingInactive(id: string): Promise<Branch | null> {
  const [row] = await db.select().from(schema.branches).where(eq(schema.branches.id, id)).limit(1);
  return row ?? null;
}

export interface BranchWithCounts extends Branch {
  program_name: string;
  subject_count: number;
  note_count: number;
  pending_note_count: number;
  student_count: number;
}

export interface ListBranchesOptions {
  programId?: string;
  includeInactive?: boolean;
  q?: string;
  /** A branch_admin sees only their own branch. */
  branchScopeId?: string;
}

export async function listBranchesWithCounts(
  options: ListBranchesOptions,
  limit: number,
  offset: number
): Promise<{ rows: BranchWithCounts[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (!options.includeInactive) conditions.push(`b.is_active`);
  if (options.programId) {
    params.push(options.programId);
    conditions.push(`b.program_id = $${params.length}`);
  }
  if (options.branchScopeId) {
    params.push(options.branchScopeId);
    conditions.push(`b.id = $${params.length}`);
  }
  if (options.q) {
    params.push(`%${options.q}%`);
    conditions.push(`(b.name ILIKE $${params.length} OR b.code ILIKE $${params.length})`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query<BranchWithCounts>(
    `SELECT b.*, p.name AS program_name,
            (SELECT COUNT(*)::int FROM subjects s WHERE s.branch_id = b.id) AS subject_count,
            (SELECT COUNT(*)::int FROM notes n
               JOIN subjects s ON s.id = n.subject_id WHERE s.branch_id = b.id) AS note_count,
            (SELECT COUNT(*)::int FROM notes n
               JOIN subjects s ON s.id = n.subject_id
              WHERE s.branch_id = b.id AND n.status = 'pending') AS pending_note_count,
            (SELECT COUNT(*)::int FROM users u WHERE u.branch_id = b.id) AS student_count
       FROM branches b JOIN programs p ON p.id = b.program_id ${where}
      ORDER BY b.is_active DESC, p.code ASC, b.code ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM branches b JOIN programs p ON p.id = b.program_id ${where}`,
    params
  );
  return { rows, total: Number(countRows[0]?.count ?? 0) };
}

export interface CreateBranchInput {
  program_id: string;
  code: string;
  name: string;
}

function rethrowBranchWriteError(err: unknown): never {
  if (isUniqueViolation(err)) {
    throw new ApiError(409, "CONFLICT", "That branch code is already used in this program");
  }
  if (isForeignKeyViolation(err)) {
    throw new ApiError(422, "VALIDATION_ERROR", "program_id does not reference an existing program");
  }
  if (isCheckViolation(err)) {
    throw new ApiError(422, "VALIDATION_ERROR", "The submitted branch does not meet the required constraints");
  }
  throw err;
}

export async function createBranch(input: CreateBranchInput): Promise<Branch> {
  try {
    const [row] = await db.insert(schema.branches).values(input).returning();
    return row!;
  } catch (err) {
    rethrowBranchWriteError(err);
  }
}

export interface UpdateBranchInput {
  code?: string;
  name?: string;
  is_active?: boolean;
}

export async function updateBranch(id: string, input: UpdateBranchInput): Promise<Branch | null> {
  if (Object.keys(input).length === 0) return getBranchByIdIncludingInactive(id);
  try {
    const [row] = await db.update(schema.branches).set(input).where(eq(schema.branches.id, id)).returning();
    return row ?? null;
  } catch (err) {
    rethrowBranchWriteError(err);
  }
}

export interface BranchDeactivationImpact {
  subjects: number;
  notes: number;
}

/**
 * Cascades to the branch's subjects for the same reason a program does — see
 * deactivateProgramCascade. Notes keep their own status.
 */
export async function deactivateBranchCascade(id: string): Promise<BranchDeactivationImpact> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const subjects = await client.query(
      `UPDATE subjects SET is_active = false WHERE is_active AND branch_id = $1`,
      [id]
    );
    const notes = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM notes n
         JOIN subjects s ON s.id = n.subject_id WHERE s.branch_id = $1`,
      [id]
    );
    await client.query(`UPDATE branches SET is_active = false WHERE id = $1`, [id]);
    await client.query("COMMIT");
    return { subjects: subjects.rowCount ?? 0, notes: Number(notes.rows[0]?.count ?? 0) };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
