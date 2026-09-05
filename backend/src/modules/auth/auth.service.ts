import { pool } from "../../config/db.js";
import { ApiError } from "../../lib/apiError.js";
import { generateOtpCode, sha256Hex } from "../../lib/hash.js";
import { signTokenPair, verifyRefreshToken, type JwtPayload, type TokenPair } from "../../lib/jwt.js";
import { sendMail } from "../../lib/mailer.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { isCheckViolation, isForeignKeyViolation, isUniqueViolation } from "../../lib/pgError.js";
import type { User } from "../../types/index.js";

interface UserRow extends User {
  password_hash: string | null;
}

const USER_COLUMNS = `id, email, full_name, role, program_id, branch_id, enrollment_year, email_verified, created_at, updated_at`;

function toPayload(user: User): JwtPayload {
  return { sub: user.id, role: user.role, program_id: user.program_id, branch_id: user.branch_id };
}

export interface RegisterInput {
  email: string;
  password: string;
  full_name: string;
  branch_id: string;
}

export async function registerStudent(input: RegisterInput): Promise<{ user: User; needsVerification: true }> {
  const passwordHash = await hashPassword(input.password);

  const { rows: existingRows } = await pool.query<{ id: string; email_verified: boolean }>(
    `SELECT id, email_verified FROM users WHERE email = $1`,
    [input.email]
  );
  const existing = existingRows[0];

  if (existing?.email_verified) {
    throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists");
  }

  try {
    let user: User;
    if (existing) {
      const { rows } = await pool.query<User>(
        `UPDATE users SET full_name = $2, password_hash = $3, branch_id = $4, updated_at = now()
         WHERE id = $1
         RETURNING ${USER_COLUMNS}`,
        [existing.id, input.full_name, passwordHash, input.branch_id]
      );
      user = rows[0]!;
    } else {
      const { rows } = await pool.query<User>(
        `INSERT INTO users (email, full_name, password_hash, role, branch_id)
         VALUES ($1, $2, $3, 'student', $4)
         RETURNING ${USER_COLUMNS}`,
        [input.email, input.full_name, passwordHash, input.branch_id]
      );
      // INSERT ... RETURNING always returns exactly one row on success;
      // tsconfig's noUncheckedIndexedAccess otherwise types rows[0] as possibly undefined.
      user = rows[0]!;
    }
    await sendVerificationOtp(user.id, user.email);
    return { user, needsVerification: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }
    if (isForeignKeyViolation(err)) {
      throw new ApiError(422, "VALIDATION_ERROR", "branch_id does not reference an existing branch");
    }
    if (isCheckViolation(err)) {
      throw new ApiError(422, "VALIDATION_ERROR", "The submitted data does not meet the required constraints");
    }
    throw err;
  }
}

async function sendVerificationOtp(userId: string, email: string): Promise<void> {
  const code = generateOtpCode();
  const codeHash = sha256Hex(code);
  await pool.query(
    `INSERT INTO email_otps (user_id, code_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')`,
    [userId, codeHash]
  );
  await sendMail({
    to: email,
    subject: "Verify your email",
    html: `<p>Your verification code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
  });
}

export async function verifyEmail(email: string, code: string): Promise<{ user: User; tokens: TokenPair }> {
  const { rows: userRows } = await pool.query<User>(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [email]);
  const userRow = userRows[0];
  if (!userRow) throw new ApiError(400, "INVALID_CODE", "Invalid verification code");

  const { rows: otpRows } = await pool.query<{
    id: string;
    code_hash: string;
    expires_at: string;
    attempts: number;
  }>(
    `SELECT id, code_hash, expires_at, attempts FROM email_otps
     WHERE user_id = $1 AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [userRow.id]
  );
  const otp = otpRows[0];
  if (!otp) throw new ApiError(400, "INVALID_CODE", "Invalid verification code");

  if (otp.attempts >= 5) {
    throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many incorrect attempts. Request a new code.");
  }
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    throw new ApiError(410, "OTP_EXPIRED", "This verification code has expired");
  }
  if (sha256Hex(code) !== otp.code_hash) {
    await pool.query(`UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1`, [otp.id]);
    throw new ApiError(401, "INVALID_CODE", "Invalid verification code");
  }

  await pool.query(`UPDATE email_otps SET consumed_at = now() WHERE id = $1`, [otp.id]);
  const { rows } = await pool.query<User>(
    `UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [userRow.id]
  );
  const user = rows[0]!;
  return { user, tokens: signTokenPair(toPayload(user)) };
}

export async function resendOtp(email: string): Promise<void> {
  const { rows } = await pool.query<{ id: string; email: string; email_verified: boolean }>(
    `SELECT id, email, email_verified FROM users WHERE email = $1`,
    [email]
  );
  const user = rows[0];
  if (!user || user.email_verified) return;

  const { rows: latest } = await pool.query<{ created_at: string }>(
    `SELECT created_at FROM email_otps WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );
  const last = latest[0];
  if (last && Date.now() - new Date(last.created_at).getTime() < 60_000) {
    throw new ApiError(429, "RATE_LIMITED", "Please wait before requesting another code");
  }

  await sendVerificationOtp(user.id, user.email);
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

  if (!row.email_verified) {
    throw new ApiError(403, "EMAIL_NOT_VERIFIED", "Please verify your email before logging in");
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
