import { and, asc, count, eq } from "drizzle-orm";
import { pool } from "../../config/db.js";
import { db, schema } from "../../db/index.js";
import { ApiError } from "../../lib/apiError.js";
import { isCheckViolation, isForeignKeyViolation, isUniqueViolation } from "../../lib/pgError.js";
import type { Subject } from "../../types/index.js";

export interface ListSubjectsOptions {
  branchId: string;
  semester?: number;
}

export async function listActiveSubjects(
  options: ListSubjectsOptions,
  limit: number,
  offset: number
): Promise<{ rows: Subject[]; total: number }> {
  const conditions = [eq(schema.subjects.branch_id, options.branchId), eq(schema.subjects.is_active, true)];
  if (options.semester !== undefined) {
    conditions.push(eq(schema.subjects.semester, options.semester));
  }
  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(schema.subjects)
      .where(where)
      .orderBy(asc(schema.subjects.semester), asc(schema.subjects.code))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(schema.subjects).where(where),
  ]);
  // count() always returns exactly one row.
  return { rows, total: countRows[0]!.total };
}

// Soft-removed subjects (is_active = false) stay hidden here too, so the
// detail route cannot resolve what the list route deliberately omits.
export async function getSubjectById(id: string): Promise<Subject | null> {
  const [row] = await db
    .select()
    .from(schema.subjects)
    .where(and(eq(schema.subjects.id, id), eq(schema.subjects.is_active, true)))
    .limit(1);
  return row ?? null;
}

/** Management counterpart to getSubjectById — see programs.service.ts. */
export async function getSubjectByIdIncludingInactive(id: string): Promise<Subject | null> {
  const [row] = await db.select().from(schema.subjects).where(eq(schema.subjects.id, id)).limit(1);
  return row ?? null;
}

export interface SubjectWithCounts extends Subject {
  branch_name: string;
  branch_code: string;
  program_id: string;
  program_name: string;
  note_count: number;
  pending_note_count: number;
  file_count: number;
}

export interface ListSubjectsAdminOptions {
  branchId?: string;
  programId?: string;
  semester?: number;
  includeInactive?: boolean;
  q?: string;
}

/**
 * The admin/search-side listing: unlike listActiveSubjects it is not pinned to
 * one branch, so a superuser can search subjects across the whole platform and
 * a program_admin across their program.
 */
export async function listSubjectsWithCounts(
  options: ListSubjectsAdminOptions,
  limit: number,
  offset: number
): Promise<{ rows: SubjectWithCounts[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (!options.includeInactive) conditions.push(`s.is_active`);
  if (options.branchId) {
    params.push(options.branchId);
    conditions.push(`s.branch_id = $${params.length}`);
  }
  if (options.programId) {
    params.push(options.programId);
    conditions.push(`b.program_id = $${params.length}`);
  }
  if (options.semester !== undefined) {
    params.push(options.semester);
    conditions.push(`s.semester = $${params.length}`);
  }
  if (options.q) {
    params.push(`%${options.q}%`);
    conditions.push(`(s.name ILIKE $${params.length} OR s.code ILIKE $${params.length})`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query<SubjectWithCounts>(
    `SELECT s.*, b.name AS branch_name, b.code AS branch_code, b.program_id, p.name AS program_name,
            (SELECT COUNT(*)::int FROM notes n WHERE n.subject_id = s.id) AS note_count,
            (SELECT COUNT(*)::int FROM notes n WHERE n.subject_id = s.id AND n.status = 'pending') AS pending_note_count,
            (SELECT COUNT(*)::int FROM files f
               JOIN notes n ON n.id = f.note_id WHERE n.subject_id = s.id) AS file_count
       FROM subjects s
       JOIN branches b ON b.id = s.branch_id
       JOIN programs p ON p.id = b.program_id ${where}
      ORDER BY s.is_active DESC, s.semester ASC, s.code ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM subjects s
       JOIN branches b ON b.id = s.branch_id
       JOIN programs p ON p.id = b.program_id ${where}`,
    params
  );
  return { rows, total: Number(countRows[0]?.count ?? 0) };
}

export interface CreateSubjectInput {
  branch_id: string;
  code: string;
  name: string;
  semester: number;
}

function rethrowSubjectWriteError(err: unknown): never {
  if (isUniqueViolation(err)) {
    throw new ApiError(409, "CONFLICT", "That subject code is already used in this branch");
  }
  if (isForeignKeyViolation(err)) {
    throw new ApiError(422, "VALIDATION_ERROR", "branch_id does not reference an existing branch");
  }
  if (isCheckViolation(err)) {
    throw new ApiError(422, "VALIDATION_ERROR", "The submitted subject does not meet the required constraints");
  }
  // subjects_check_semester_trg raises when the semester exceeds the program's
  // duration. It is a plpgsql RAISE, not a CHECK, so it arrives as a plain
  // error with SQLSTATE P0001 rather than one of the codes above.
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P0001") {
    throw new ApiError(422, "VALIDATION_ERROR", "That semester is beyond the program's duration");
  }
  throw err;
}

export async function createSubject(input: CreateSubjectInput): Promise<Subject> {
  try {
    const [row] = await db.insert(schema.subjects).values(input).returning();
    return row!;
  } catch (err) {
    rethrowSubjectWriteError(err);
  }
}

export interface UpdateSubjectInput {
  code?: string;
  name?: string;
  semester?: number;
  is_active?: boolean;
}

export async function updateSubject(id: string, input: UpdateSubjectInput): Promise<Subject | null> {
  if (Object.keys(input).length === 0) return getSubjectByIdIncludingInactive(id);
  try {
    const [row] = await db.update(schema.subjects).set(input).where(eq(schema.subjects.id, id)).returning();
    return row ?? null;
  } catch (err) {
    rethrowSubjectWriteError(err);
  }
}

/** How many notes a subject would take out of browse if it were deactivated. */
export async function countSubjectNotes(id: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM notes WHERE subject_id = $1`,
    [id]
  );
  return Number(rows[0]?.count ?? 0);
}

export async function deactivateSubject(id: string): Promise<number> {
  const notes = await countSubjectNotes(id);
  await pool.query(`UPDATE subjects SET is_active = false WHERE id = $1`, [id]);
  return notes;
}
