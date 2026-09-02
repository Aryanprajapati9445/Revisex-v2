import { pool } from "../../config/db.js";
import { ApiError } from "../../lib/apiError.js";
import { hashPassword } from "../../lib/password.js";
import type { User, UserRole } from "../../types/index.js";

const USER_COLUMNS = `id, email, full_name, role, program_id, branch_id, enrollment_year, created_at, updated_at`;

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505";
}

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23503";
}

export interface ListUsersOptions {
  role?: UserRole;
  branchId?: string;
  programScopeId?: string; // program_admin's own program — restricts to that program's tree
  branchScopeId?: string; // branch_admin's own branch — restricts to just that branch
}

export async function listUsers(
  options: ListUsersOptions,
  limit: number,
  offset: number
): Promise<{ rows: User[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.branchScopeId) {
    params.push(options.branchScopeId);
    conditions.push(`u.branch_id = $${params.length}`);
  } else if (options.programScopeId) {
    params.push(options.programScopeId);
    conditions.push(
      `(u.program_id = $${params.length} OR u.branch_id IN (SELECT id FROM branches WHERE program_id = $${params.length}))`
    );
  }

  if (options.role) {
    params.push(options.role);
    conditions.push(`u.role = $${params.length}`);
  }
  if (options.branchId) {
    params.push(options.branchId);
    conditions.push(`u.branch_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query<User>(
    `SELECT u.id, u.email, u.full_name, u.role, u.program_id, u.branch_id, u.enrollment_year, u.created_at, u.updated_at
     FROM users u ${where}
     ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM users u ${where}`,
    params
  );
  // COUNT(*) always returns exactly one row; ?? 0 satisfies noUncheckedIndexedAccess.
  return { rows, total: Number(countRows[0]?.count ?? 0) };
}

export async function getUserById(id: string): Promise<User | null> {
  const { rows } = await pool.query<User>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function updateOwnProfile(id: string, fullName: string): Promise<User> {
  const { rows } = await pool.query<User>(
    `UPDATE users SET full_name = $1 WHERE id = $2 RETURNING ${USER_COLUMNS}`,
    [fullName, id]
  );
  // UPDATE ... RETURNING on a valid id always returns exactly one row.
  return rows[0]!;
}

export interface CreateUserInput {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  program_id: string | null;
  branch_id: string | null;
  enrollment_year: number | null;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const passwordHash = await hashPassword(input.password);
  try {
    const { rows } = await pool.query<User>(
      `INSERT INTO users (email, full_name, password_hash, role, program_id, branch_id, enrollment_year)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${USER_COLUMNS}`,
      [input.email, input.full_name, passwordHash, input.role, input.program_id, input.branch_id, input.enrollment_year]
    );
    // INSERT ... RETURNING always returns exactly one row on success.
    return rows[0]!;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }
    if (isForeignKeyViolation(err)) {
      throw new ApiError(422, "VALIDATION_ERROR", "program_id or branch_id does not reference an existing row");
    }
    throw err;
  }
}

export interface UpdateUserInput {
  full_name?: string;
  role?: UserRole;
  program_id?: string | null;
  branch_id?: string | null;
  enrollment_year?: number | null;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(input)) {
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  if (sets.length === 0) return getUserById(id);

  params.push(id);
  try {
    const { rows } = await pool.query<User>(
      `UPDATE users SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING ${USER_COLUMNS}`,
      params
    );
    return rows[0] ?? null;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }
    if (isForeignKeyViolation(err)) {
      throw new ApiError(422, "VALIDATION_ERROR", "program_id or branch_id does not reference an existing row");
    }
    throw err;
  }
}

export async function deleteUser(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function branchBelongsToProgram(branchId: string, programId: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT 1 FROM branches WHERE id = $1 AND program_id = $2`, [branchId, programId]);
  return rows.length > 0;
}
