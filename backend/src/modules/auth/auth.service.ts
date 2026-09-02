import { pool } from "../../config/db.js";
import { ApiError } from "../../lib/apiError.js";
import { signTokenPair, verifyRefreshToken, type JwtPayload, type TokenPair } from "../../lib/jwt.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import type { User } from "../../types/index.js";

interface UserRow extends User {
  password_hash: string | null;
}

const USER_COLUMNS = `id, email, full_name, role, program_id, branch_id, enrollment_year, created_at, updated_at`;

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505";
}

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23503";
}

function toPayload(user: User): JwtPayload {
  return { sub: user.id, role: user.role, program_id: user.program_id, branch_id: user.branch_id };
}

export interface RegisterInput {
  email: string;
  password: string;
  full_name: string;
  branch_id: string;
}

export async function registerStudent(input: RegisterInput): Promise<{ user: User; tokens: TokenPair }> {
  const passwordHash = await hashPassword(input.password);
  try {
    const { rows } = await pool.query<User>(
      `INSERT INTO users (email, full_name, password_hash, role, branch_id)
       VALUES ($1, $2, $3, 'student', $4)
       RETURNING ${USER_COLUMNS}`,
      [input.email, input.full_name, passwordHash, input.branch_id]
    );
    // INSERT ... RETURNING always returns exactly one row on success;
    // tsconfig's noUncheckedIndexedAccess otherwise types rows[0] as possibly undefined.
    const user = rows[0]!;
    return { user, tokens: signTokenPair(toPayload(user)) };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }
    if (isForeignKeyViolation(err)) {
      throw new ApiError(422, "VALIDATION_ERROR", "branch_id does not reference an existing branch");
    }
    throw err;
  }
}

export async function login(email: string, password: string): Promise<{ user: User; tokens: TokenPair }> {
  const { rows } = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = $1`,
    [email]
  );
  const row = rows[0];
  if (!row || !row.password_hash) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  }

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  }

  const { password_hash: _drop, ...user } = row;
  return { user, tokens: signTokenPair(toPayload(user)) };
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  let payload: JwtPayload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, "INVALID_TOKEN", "Refresh token is invalid or expired");
  }

  const { rows } = await pool.query<User>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [payload.sub]);
  const user = rows[0];
  if (!user) {
    throw new ApiError(401, "INVALID_TOKEN", "Refresh token no longer maps to a valid user");
  }

  return signTokenPair(toPayload(user));
}

export async function getUserById(id: string): Promise<User | null> {
  const { rows } = await pool.query<User>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}
