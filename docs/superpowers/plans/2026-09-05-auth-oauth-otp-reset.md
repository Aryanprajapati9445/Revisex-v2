# Google OAuth, Forgot Password, Signup OTP, Password Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google OAuth sign-in/signup, an emailed-link forgot-password flow, mandatory email-OTP verification at signup, and a password-visibility toggle to the existing Express+Postgres+React auth system.

**Architecture:** Two new tables (`email_otps`, `password_reset_tokens`) plus a `users.email_verified` column, added via the repo's Drizzle-schema-first workflow. `auth.service.ts` grows OTP/reset/Google functions alongside the existing register/login/refresh. A single `mailer.ts` seam (nodemailer/SMTP) sends both OTP and reset emails. Google uses a backend authorization-code redirect — the frontend never touches a Google SDK or token. New-user OAuth signups without a `branch_id` get a short-lived signed "pending" token and a one-screen profile-completion step, rather than a partial DB row.

**Tech Stack:** Express, TypeScript, raw `pg`, Drizzle (schema/types only, not query builder), Zod, JWT (`jsonwebtoken`), bcrypt, nodemailer (new), Vitest+Supertest (backend), React, react-router-dom, TanStack Query, Vitest+Testing Library+MSW (frontend).

**Spec:** `docs/superpowers/specs/2026-09-05-auth-oauth-otp-reset-design.md`

## Global Constraints

- Response envelope: every success response is `{ success: true, data }`; every error is `{ success: false, error: { code, message } }` (`backend/src/lib/response.ts`, `backend/src/middleware/errorHandler.ts`). New endpoints follow this exactly — no exceptions except the two OAuth redirect routes, which are browser navigations (`res.redirect`), not JSON.
- No `/api/v1` versioning — new routes stay at `/api/auth/<name>`.
- Password hashing stays bcrypt (`backend/src/lib/password.ts`); OTP codes and reset tokens are hashed with SHA-256 (`sha256Hex`, new in this plan) — different mechanism because these are single-use, short-lived, and never re-verified by a human typing the same value at a stable rate.
- Stateless JWTs only. No new session store, no cookies, no `express-rate-limit` dependency — rate limiting is a `created_at` timestamp comparison on the relevant table row.
- `POST /api/auth/forgot-password` always returns `200` regardless of whether the email exists or has a password (non-enumeration). This does not apply to `/register`'s existing `409 EMAIL_TAKEN`, which is unchanged.
- Google OAuth: provider is Google only. Flow is backend authorization-code redirect. Tokens return to the frontend via URL fragment (`#accessToken=...&refreshToken=...`), never query string.
- `db/` schema changes go through `drizzle/schema/*.ts` → `npm run db:generate` → review generated SQL → `npm run db:migrate` → `npm run build`. The frozen `migrations/000001_initial_schema.up.sql` (golang-migrate) is never touched again.
- `backend/src/types/index.ts` types are inferred from `db/dist/schema` — after any schema change, `db`'s `npm run build` must run before `backend` will typecheck.

---

## Task 1: Database — `email_verified`, `email_otps`, `password_reset_tokens`

**Files:**
- Modify: `db/drizzle/schema/users.ts`
- Create: `db/drizzle/schema/email-otps.ts`
- Create: `db/drizzle/schema/password-reset-tokens.ts`
- Modify: `db/drizzle/schema/index.ts`
- Modify: `backend/tests/helpers/db.ts`
- Modify: `backend/tests/helpers/fixtures.ts`

**Interfaces:**
- Produces: `users.email_verified: boolean` (backfilled `true` on existing rows); table `email_otps(id, user_id, code_hash, expires_at, consumed_at, attempts, created_at)`; table `password_reset_tokens(id, user_id, token_hash, expires_at, consumed_at, created_at)`. `backend/src/types/index.ts`'s `User` type (Drizzle-inferred) gains `email_verified: boolean` automatically once `db`'s build runs. `createUserFixture` gains an `emailVerified` option (default `true`, so every existing test that logs in via `/api/auth/login` keeps working unchanged).

- [ ] **Step 1: Add `email_verified` to the users schema**

Edit `db/drizzle/schema/users.ts` — add the column and keep everything else as-is:

```ts
    password_hash: text("password_hash"),
    auth_provider: varchar("auth_provider", { length: 30 }),
    provider_user_id: text("provider_user_id"),

    email_verified: boolean("email_verified").notNull().default(false),

    role: userRoleEnum("role").notNull().default("student"),
```

Add `boolean` to the import at the top of the file:

```ts
import { boolean, check, index, pgTable, smallint, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Create the `email_otps` schema**

Create `db/drizzle/schema/email-otps.ts`:

```ts
import { index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

// One row per code sent. Old rows for a user are simply superseded (found
// via ORDER BY created_at DESC LIMIT 1 in the query layer), not deleted —
// there's no correctness reason to delete them.
export const emailOtps = pgTable(
  "email_otps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code_hash: text("code_hash").notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    consumed_at: timestamp("consumed_at", { withTimezone: true, mode: "string" }),
    attempts: integer("attempts").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [index("idx_email_otps_user_id").on(table.user_id)]
);

export type EmailOtp = typeof emailOtps.$inferSelect;
export type NewEmailOtp = typeof emailOtps.$inferInsert;
```

Note: `code_hash`/`token_hash` are `text`, not `varchar`, matching `password_hash`'s type in `users.ts` — this repo doesn't cap hash-shaped columns.

- [ ] **Step 3: Create the `password_reset_tokens` schema**

Create `db/drizzle/schema/password-reset-tokens.ts`:

```ts
import { index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token_hash: text("token_hash").notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    consumed_at: timestamp("consumed_at", { withTimezone: true, mode: "string" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [index("idx_password_reset_tokens_user_id").on(table.user_id)]
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
```

This file is missing the `text` import used above — add it:

```ts
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
```

Go back and add the same `text` import to `email-otps.ts` from Step 2 (it uses `text("code_hash")` too):

```ts
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
```

- [ ] **Step 4: Export the new tables**

Edit `db/drizzle/schema/index.ts`, add after the `users` export:

```ts
export * from "./users.js";
export * from "./email-otps.js";
export * from "./password-reset-tokens.js";
export * from "./notes.js";
```

- [ ] **Step 5: Generate, review, and apply the migration**

```bash
cd db
npm run db:generate
```

Open the newly created file under `db/drizzle/migrations/` (it will be numbered after `0002_motionless_mongoose.sql`) and confirm it contains exactly:
- `ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;`
- `CREATE TABLE "email_otps" (...)` with the columns from Step 2, plus its FK and index.
- `CREATE TABLE "password_reset_tokens" (...)` with the columns from Step 3, plus its FK and index.

If it contains anything else (e.g. it tries to touch an unrelated table), stop and re-check Steps 1-4 before proceeding — do not hand-edit the generated file.

Apply it:

```bash
npm run db:migrate
npm run build
```

`npm run build` is required before `backend/` will see `email_verified` on the inferred `User` type.

- [ ] **Step 6: Backfill existing rows and verify**

The generated migration's `ADD COLUMN ... DEFAULT false NOT NULL` already backfills every existing row to `false` (Postgres applies the literal default to all rows in the same statement for a non-volatile default). Per the design, existing users should not be locked out, so flip them to `true` once, by hand, against Neon:

```bash
make psql
```

At the `psql` prompt:

```sql
UPDATE users SET email_verified = true;
```

This is a one-time manual backfill (not part of the migration, since a migration re-run on a fresh database should leave new rows at their real default of `false`). Confirm with `SELECT email_verified, count(*) FROM users GROUP BY 1;` before exiting.

- [ ] **Step 7: Update test helpers for the new tables and column**

Edit `backend/tests/helpers/db.ts`:

```ts
export async function truncateAll(): Promise<void> {
  await pool.query(
    `TRUNCATE TABLE files, notes, subjects, branches, programs, users,
                   audit_log, user_roles, role_permissions, roles, permissions,
                   email_otps, password_reset_tokens
     RESTART IDENTITY CASCADE`
  );
}
```

Edit `backend/tests/helpers/fixtures.ts` — add `emailVerified` to `CreateUserOptions` and the insert:

```ts
export interface CreateUserOptions {
  role: UserRole;
  programId?: string | null;
  branchId?: string | null;
  password?: string;
  email?: string;
  emailVerified?: boolean;
}

export async function createUserFixture(options: CreateUserOptions) {
  const email = options.email ?? `${unique("user")}@test.edu`;
  const password = options.password ?? "password123";
  const passwordHash = await bcrypt.hash(password, FIXTURE_SALT_ROUNDS);
  const { rows } = await pool.query(
    `INSERT INTO users (email, full_name, password_hash, role, program_id, branch_id, email_verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      email,
      "Test User",
      passwordHash,
      options.role,
      options.programId ?? null,
      options.branchId ?? null,
      options.emailVerified ?? true,
    ]
  );
  return { user: rows[0], password };
}
```

Defaulting `emailVerified` to `true` means every existing test file that logs in through `/api/auth/login` (`notes.test.ts` uses `signAccessToken` directly and is unaffected either way) keeps passing without modification.

- [ ] **Step 8: Verify the whole backend test suite still runs**

```bash
cd backend
npm test
```

Expected: all currently-passing tests still pass (the `users_role_scope` etc. constraints are untouched; only a new nullable-by-default-false column and two new tables were added). This confirms Steps 1-7 didn't break anything before Task 2 starts building on top of them.

- [ ] **Step 9: Commit**

```bash
git add db/drizzle/schema/users.ts db/drizzle/schema/email-otps.ts \
        db/drizzle/schema/password-reset-tokens.ts db/drizzle/schema/index.ts \
        db/drizzle/migrations backend/tests/helpers/db.ts backend/tests/helpers/fixtures.ts
git commit -m "feat(db): add email_verified, email_otps, password_reset_tokens"
```

Do not `git add -A` — this directory has unrelated pre-existing uncommitted deletions from before this work started; stage only the files listed.

---

## Task 2: Backend infra — env vars, hashing, mailer, OAuth JWT helpers

**Files:**
- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env.example`
- Modify: `backend/.env.test.example`
- Modify: `backend/.env.test` (if it exists locally, gitignored — mirror `.env.test.example`)
- Create: `backend/src/lib/hash.ts`
- Create: `backend/src/lib/mailer.ts`
- Modify: `backend/src/lib/jwt.ts`
- Modify: `backend/package.json` (new dependency)

**Interfaces:**
- Produces: `sha256Hex(value: string): string`, `generateOtpCode(): string` (6 digits, zero-padded), `generateResetToken(): string` (64 hex chars); `sendMail(opts: { to: string; subject: string; html: string }): Promise<void>`; `signOAuthState(): string`, `verifyOAuthState(token: string): OAuthStatePayload` (throws on invalid/expired/wrong-purpose), `signOAuthPending(payload: Omit<OAuthPendingPayload, "purpose">): string`, `verifyOAuthPending(token: string): OAuthPendingPayload`.
- Consumes: nothing new from other tasks.

- [ ] **Step 1: Add nodemailer**

```bash
cd backend
npm install nodemailer
npm install -D @types/nodemailer
```

- [ ] **Step 2: Add new env vars**

Edit `backend/src/config/env.ts`, add to `envSchema` (after `AWS_S3_BUCKET`):

```ts
  AWS_S3_BUCKET: z.string().min(1),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:5173"),
  OAUTH_TOKEN_SECRET: z.string().min(32),

  // Outbound email (OTP + password reset)
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  MAIL_FROM: z.string().min(1),
```

- [ ] **Step 3: Document the new env vars**

Append to `backend/.env.example`:

```
# Google OAuth — from Google Cloud Console credentials, authorized redirect
# URI must exactly match GOOGLE_REDIRECT_URI.
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-client-secret>
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
APP_URL=http://localhost:5173

# Signs the short-lived OAuth "state" (CSRF) and "pending profile" tokens.
# Separate from JWT_ACCESS_SECRET/JWT_REFRESH_SECRET on purpose — these
# tokens carry a different claim shape and must never verify against the
# session-token secrets. Generate with `openssl rand -hex 32`.
OAUTH_TOKEN_SECRET=<32+ char random string>

# SMTP — sends signup verification codes and password-reset links.
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=<smtp-username>
SMTP_PASS=<smtp-password>
MAIL_FROM="Revisex <no-reply@revisex.app>"
```

Append the same block to `backend/.env.test.example`, but with test-safe placeholder values (this file is committed, unlike `.env.test`):

```
GOOGLE_CLIENT_ID=test-client-id
GOOGLE_CLIENT_SECRET=test-client-secret
GOOGLE_REDIRECT_URI=http://localhost:4001/api/auth/google/callback
APP_URL=http://localhost:5173
OAUTH_TOKEN_SECRET=test-oauth-secret-change-me-please-32-chars-min

SMTP_HOST=localhost
SMTP_PORT=587
SMTP_USER=test
SMTP_PASS=test
MAIL_FROM="Revisex Test <test@example.com>"
```

If `backend/.env.test` exists on disk (gitignored, used by the real test run), copy the same block into it manually — tests will fail `env.ts`'s `safeParse` otherwise. Tests never call real SMTP or Google endpoints (both are mocked in later tasks), so these values just need to satisfy the Zod schema.

- [ ] **Step 4: Write `lib/hash.ts`**

```ts
import { createHash, randomBytes, randomInt } from "node:crypto";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Zero-padded 6-digit code, e.g. "004821". */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** 32 random bytes as hex — used as the raw (pre-hash) password-reset token. */
export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}
```

- [ ] **Step 5: Write `lib/mailer.ts`**

```ts
import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail(opts: SendMailOptions): Promise<void> {
  await transport.sendMail({ from: env.MAIL_FROM, to: opts.to, subject: opts.subject, html: opts.html });
}
```

- [ ] **Step 6: Add OAuth JWT helpers**

Edit `backend/src/lib/jwt.ts`, append at the end of the file:

```ts
export interface OAuthStatePayload {
  purpose: "oauth_state";
}

export interface OAuthPendingPayload {
  purpose: "oauth_pending";
  provider: "google";
  providerUserId: string;
  email: string;
  fullName: string;
}

// Signed with a secret distinct from the session-token secrets above, so a
// state/pending token can never be replayed as (or confused with) an access
// or refresh token even if someone got the claim shapes to overlap.
export function signOAuthState(): string {
  const payload: OAuthStatePayload = { purpose: "oauth_state" };
  return jwt.sign(payload, env.OAUTH_TOKEN_SECRET, { expiresIn: "10m" });
}

export function verifyOAuthState(token: string): OAuthStatePayload {
  const payload = jwt.verify(token, env.OAUTH_TOKEN_SECRET) as OAuthStatePayload;
  if (payload.purpose !== "oauth_state") throw new Error("Invalid token purpose");
  return payload;
}

export function signOAuthPending(payload: Omit<OAuthPendingPayload, "purpose">): string {
  const full: OAuthPendingPayload = { purpose: "oauth_pending", ...payload };
  return jwt.sign(full, env.OAUTH_TOKEN_SECRET, { expiresIn: "15m" });
}

export function verifyOAuthPending(token: string): OAuthPendingPayload {
  const payload = jwt.verify(token, env.OAUTH_TOKEN_SECRET) as OAuthPendingPayload;
  if (payload.purpose !== "oauth_pending") throw new Error("Invalid token purpose");
  return payload;
}
```

- [ ] **Step 7: Typecheck**

```bash
cd backend
npm run typecheck
```

Expected: passes (no test to run yet — these are pure library functions consumed starting in Task 3).

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/config/env.ts \
        backend/.env.example backend/.env.test.example backend/src/lib/hash.ts \
        backend/src/lib/mailer.ts backend/src/lib/jwt.ts
git commit -m "feat(backend): add mailer, hashing, and OAuth token helpers"
```

---

## Task 3: Signup email-OTP verification (register/verify-email/resend-otp/login gate)

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts`
- Modify: `backend/src/modules/auth/auth.controller.ts`
- Modify: `backend/src/modules/auth/auth.routes.ts`
- Modify: `backend/src/types/index.ts` (expose `email_verified` on `User`)
- Modify: `backend/tests/modules/auth.test.ts`

**Interfaces:**
- Consumes from Task 2: `sha256Hex`, `generateOtpCode`, `sendMail`.
- Produces: `authService.registerStudent(input): Promise<{ user: User; needsVerification: true }>` (breaking change — no longer returns `tokens`); `authService.verifyEmail(email, code): Promise<{ user: User; tokens: TokenPair }>`; `authService.resendOtp(email): Promise<void>`; `authService.login` now throws `403 EMAIL_NOT_VERIFIED` for an unverified account. Routes: `POST /api/auth/verify-email`, `POST /api/auth/resend-otp`.

- [ ] **Step 1: Expose `email_verified` on the `User` type**

`backend/src/types/index.ts`'s `User` type is `Omit<typeof users.$inferSelect, "password_hash">` — it already includes `email_verified` automatically once Task 1's `db` build ran (nothing to change here; this step is just confirming it). Verify:

```bash
cd backend
node -e "const {User} = require('./node_modules/.bin/tsc'); " 2>/dev/null; grep -n "email_verified" ../db/dist/schema/users.d.ts
```

Expected: `email_verified: boolean;` appears in the output. If it doesn't, re-run `npm run build` in `db/` (Task 1, Step 5) before continuing.

- [ ] **Step 2: Write the failing tests for register/verify/resend/login-gate**

Replace the first test in `backend/tests/modules/auth.test.ts`'s `describe("POST /api/auth/register")` block (the one asserting tokens come back) and add the new blocks. Edit the file:

```ts
describe("POST /api/auth/register", () => {
  it("creates an unverified student account and does not return tokens", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);

    const res = await request(app).post("/api/auth/register").send({
      email: "student@test.edu",
      password: "password123",
      full_name: "Test Student",
      branch_id: branch.id,
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe("student");
    expect(res.body.data.user.email_verified).toBe(false);
    expect(res.body.data.needsVerification).toBe(true);
    expect(res.body.data).not.toHaveProperty("accessToken");
    expect(res.body.data).not.toHaveProperty("refreshToken");
  });

  it("rejects a duplicate VERIFIED email with 409", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({ role: "student", branchId: branch.id, email: "dupe@test.edu", emailVerified: true });

    const res = await request(app).post("/api/auth/register").send({
      email: "dupe@test.edu",
      password: "password123",
      full_name: "Another Student",
      branch_id: branch.id,
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("replaces an existing UNVERIFIED row instead of 409ing", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user: first } = await createUserFixture({
      role: "student",
      branchId: branch.id,
      email: "stuck@test.edu",
      emailVerified: false,
    });

    const res = await request(app).post("/api/auth/register").send({
      email: "stuck@test.edu",
      password: "newpassword123",
      full_name: "Retry Student",
      branch_id: branch.id,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.user.id).toBe(first.id);
    expect(res.body.data.user.full_name).toBe("Retry Student");
  });

  it("rejects an invalid body with 422", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "not-an-email" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/auth/verify-email", () => {
  async function registerAndGetOtp(email: string) {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await request(app)
      .post("/api/auth/register")
      .send({ email, password: "password123", full_name: "Verifier", branch_id: branch.id });
    const { rows } = await pool.query<{ code_hash: string }>(
      `SELECT eo.code_hash FROM email_otps eo JOIN users u ON u.id = eo.user_id WHERE u.email = $1`,
      [email]
    );
    return rows[0]!.code_hash;
  }

  it("verifies with the correct code and returns tokens", async () => {
    const email = "verify-ok@test.edu";
    await registerAndGetOtp(email);
    // The real code isn't returned by the API (only its hash is in the DB) —
    // read it back via the mocked mailer instead (wired in Step 4 below).
    const code = mailerMock.mock.calls.at(-1)![0].html.match(/(\d{6})/)![1];

    const res = await request(app).post("/api/auth/verify-email").send({ email, code });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email_verified).toBe(true);
    expect(typeof res.body.data.accessToken).toBe("string");
  });

  it("rejects a wrong code with 401 and increments attempts", async () => {
    const email = "verify-wrong@test.edu";
    await registerAndGetOtp(email);

    const res = await request(app).post("/api/auth/verify-email").send({ email, code: "000000" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CODE");
  });

  it("locks out after 5 wrong attempts with 429", async () => {
    const email = "verify-lockout@test.edu";
    await registerAndGetOtp(email);

    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/auth/verify-email").send({ email, code: "000000" });
    }
    const res = await request(app).post("/api/auth/verify-email").send({ email, code: "000000" });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("TOO_MANY_ATTEMPTS");
  });

  it("rejects an expired code with 410", async () => {
    const email = "verify-expired@test.edu";
    await registerAndGetOtp(email);
    await pool.query(
      `UPDATE email_otps SET expires_at = now() - interval '1 minute'
       WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [email]
    );
    const code = mailerMock.mock.calls.at(-1)![0].html.match(/(\d{6})/)![1];

    const res = await request(app).post("/api/auth/verify-email").send({ email, code });

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("OTP_EXPIRED");
  });
});

describe("POST /api/auth/resend-otp", () => {
  it("issues a new code after the cooldown and invalidates checking against the old one's row", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const email = "resend@test.edu";
    await request(app)
      .post("/api/auth/register")
      .send({ email, password: "password123", full_name: "Resender", branch_id: branch.id });

    await pool.query(
      `UPDATE email_otps SET created_at = now() - interval '2 minutes'
       WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [email]
    );

    const res = await request(app).post("/api/auth/resend-otp").send({ email });
    expect(res.status).toBe(200);

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM email_otps eo JOIN users u ON u.id = eo.user_id WHERE u.email = $1`,
      [email]
    );
    expect(rows[0].n).toBe(2);
  });

  it("rate-limits a resend within 60s with 429", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const email = "resend-fast@test.edu";
    await request(app)
      .post("/api/auth/register")
      .send({ email, password: "password123", full_name: "Fast Resender", branch_id: branch.id });

    const res = await request(app).post("/api/auth/resend-otp").send({ email });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });

  it("returns 200 for an unknown email without sending anything (no enumeration)", async () => {
    const res = await request(app).post("/api/auth/resend-otp").send({ email: "nobody@test.edu" });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/auth/login — verification gate", () => {
  it("rejects login for an unverified account with 403", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({
      role: "student",
      branchId: branch.id,
      email: "unverified@test.edu",
      password: "password123",
      emailVerified: false,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "unverified@test.edu", password: "password123" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd backend
npm test -- auth.test.ts
```

Expected: FAIL — `registerStudent` still returns `tokens`, `needsVerification` is `undefined`, `/api/auth/verify-email` and `/api/auth/resend-otp` 404, and `mailerMock` is undefined (added next step).

- [ ] **Step 4: Mock the mailer in the test file**

At the top of `backend/tests/modules/auth.test.ts`, add the mock before the other imports resolve it (vitest hoists `vi.mock` calls, so placement in the file doesn't matter, but keep it near the top for readability):

```ts
import { vi } from "vitest";

const mailerMock = vi.fn(async () => undefined);
vi.mock("../../src/lib/mailer.js", () => ({ sendMail: mailerMock }));
```

Add `beforeEach(() => mailerMock.mockClear());` alongside the existing `beforeEach(async () => { await truncateAll(); });` (two separate `beforeEach` calls, or combine into one — combine into one for clarity):

```ts
beforeEach(async () => {
  await truncateAll();
  mailerMock.mockClear();
});
```

- [ ] **Step 5: Implement `registerStudent` changes and the OTP functions**

Edit `backend/src/modules/auth/auth.service.ts`. Add imports:

```ts
import { generateOtpCode, sha256Hex } from "../../lib/hash.js";
import { sendMail } from "../../lib/mailer.js";
```

`USER_COLUMNS` is the shared column list used by every query that returns a `User` — it needs `email_verified` added once, here, so every function below (and `login`, `handleGoogleCallback`, `completeGoogleSignup` in later tasks) picks it up automatically instead of appending it at each call site:

```ts
const USER_COLUMNS = `id, email, full_name, role, program_id, branch_id, enrollment_year, email_verified, created_at, updated_at`;
```

Replace `registerStudent` entirely:

```ts
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
  const { rows: userRows } = await pool.query<User>(
    `SELECT ${USER_COLUMNS} FROM users WHERE email = $1`,
    [email]
  );
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
```

- [ ] **Step 6: Add the login verification gate**

In `login` (existing function), after the `verifyPassword` check succeeds and before building the return value:

```ts
  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  }

  if (!row.email_verified) {
    throw new ApiError(403, "EMAIL_NOT_VERIFIED", "Please verify your email before logging in");
  }

  const { password_hash: _drop, ...user } = row;
```

- [ ] **Step 7: Wire the controller and routes**

Edit `backend/src/modules/auth/auth.controller.ts` — update `register` and add the two new handlers:

```ts
const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

const resendOtpSchema = z.object({
  email: z.string().email(),
});

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const input = registerSchema.parse(req.body);
    const { user, needsVerification } = await authService.registerStudent(input);
    sendSuccess(res, { user, needsVerification }, 201);
  } catch (err) {
    next(err);
  }
}

export async function verifyEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, code } = verifyEmailSchema.parse(req.body);
    const { user, tokens } = await authService.verifyEmail(email, code);
    sendSuccess(res, { user, ...tokens });
  } catch (err) {
    next(err);
  }
}

export async function resendOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = resendOtpSchema.parse(req.body);
    await authService.resendOtp(email);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}
```

Edit `backend/src/modules/auth/auth.routes.ts`:

```ts
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { login, logout, me, refresh, register, resendOtp, verifyEmail } from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/verify-email", verifyEmail);
authRouter.post("/resend-otp", resendOtp);
authRouter.post("/login", login);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
cd backend
npm test -- auth.test.ts
```

Expected: PASS, all tests including the rewritten register block and the four new `describe` blocks.

- [ ] **Step 9: Run the full backend suite**

```bash
npm test
```

Expected: PASS. If `notes.test.ts`, `users.test.ts`, `admin.test.ts` or `notes-files.test.ts` fail, check whether they call `/api/auth/login` anywhere — Task 1 Step 7 already defaulted fixture users to `emailVerified: true`, so this should not happen, but confirm before moving on.

- [ ] **Step 10: Commit**

```bash
git add backend/src/modules/auth backend/tests/modules/auth.test.ts
git commit -m "feat(auth): add mandatory email-OTP verification at signup"
```

---

## Task 4: Forgot password / reset password

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts`
- Modify: `backend/src/modules/auth/auth.controller.ts`
- Modify: `backend/src/modules/auth/auth.routes.ts`
- Modify: `backend/tests/modules/auth.test.ts`

**Interfaces:**
- Consumes from Task 2: `sha256Hex`, `generateResetToken`, `sendMail`, `env.APP_URL`.
- Produces: `authService.forgotPassword(email): Promise<void>` (never throws for a normal client-facing reason — always resolves); `authService.resetPassword(token, newPassword): Promise<void>`. Routes: `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/modules/auth.test.ts`:

```ts
describe("POST /api/auth/forgot-password", () => {
  it("sends a reset email for an existing password account", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({ role: "student", branchId: branch.id, email: "forgot@test.edu", emailVerified: true });

    const res = await request(app).post("/api/auth/forgot-password").send({ email: "forgot@test.edu" });

    expect(res.status).toBe(200);
    expect(mailerMock).toHaveBeenCalledTimes(1);
    expect(mailerMock.mock.calls[0][0].to).toBe("forgot@test.edu");
  });

  it("returns 200 without sending anything for an unknown email", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({ email: "nobody@test.edu" });
    expect(res.status).toBe(200);
    expect(mailerMock).not.toHaveBeenCalled();
  });

  it("returns 200 without sending anything for a password-less (OAuth-only) account", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await pool.query(
      `INSERT INTO users (email, full_name, auth_provider, provider_user_id, role, branch_id, email_verified)
       VALUES ('oauth-only@test.edu', 'OAuth User', 'google', 'google-sub-1', 'student', $1, true)`,
      [branch.id]
    );

    const res = await request(app).post("/api/auth/forgot-password").send({ email: "oauth-only@test.edu" });
    expect(res.status).toBe(200);
    expect(mailerMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/reset-password", () => {
  async function requestResetAndGetToken(email: string) {
    await request(app).post("/api/auth/forgot-password").send({ email });
    const html = mailerMock.mock.calls.at(-1)![0].html as string;
    return html.match(/token=([a-f0-9]+)/)![1];
  }

  it("resets the password with a valid token", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({ role: "student", branchId: branch.id, email: "reset@test.edu", emailVerified: true });

    const token = await requestResetAndGetToken("reset@test.edu");
    const res = await request(app).post("/api/auth/reset-password").send({ token, password: "newpassword456" });
    expect(res.status).toBe(200);

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "reset@test.edu", password: "newpassword456" });
    expect(loginRes.status).toBe(200);
  });

  it("rejects a reused token with 410 TOKEN_USED", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({ role: "student", branchId: branch.id, email: "reuse@test.edu", emailVerified: true });
    const token = await requestResetAndGetToken("reuse@test.edu");

    await request(app).post("/api/auth/reset-password").send({ token, password: "firstchange1" });
    const res = await request(app).post("/api/auth/reset-password").send({ token, password: "secondchange1" });

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("TOKEN_USED");
  });

  it("rejects an expired token with 410 TOKEN_EXPIRED", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({ role: "student", branchId: branch.id, email: "expired@test.edu", emailVerified: true });
    const token = await requestResetAndGetToken("expired@test.edu");
    await pool.query(`UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'`);

    const res = await request(app).post("/api/auth/reset-password").send({ token, password: "wontwork123" });

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
  });

  it("rejects an unknown token with 400 INVALID_TOKEN", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({ token: "not-a-real-token", password: "wontwork123" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend
npm test -- auth.test.ts
```

Expected: FAIL — routes don't exist yet (404s).

- [ ] **Step 3: Implement the service functions**

Add to `backend/src/modules/auth/auth.service.ts` (imports for `generateResetToken` and `env` needed — add `import { env } from "../../config/env.js";` and extend the existing `hash.js` import to include `generateResetToken`):

```ts
export async function forgotPassword(email: string): Promise<void> {
  const { rows } = await pool.query<{ id: string; email: string; password_hash: string | null }>(
    `SELECT id, email, password_hash FROM users WHERE email = $1`,
    [email]
  );
  const user = rows[0];
  if (!user || !user.password_hash) return;

  const { rows: latest } = await pool.query<{ created_at: string }>(
    `SELECT created_at FROM password_reset_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );
  const last = latest[0];
  if (last && Date.now() - new Date(last.created_at).getTime() < 60_000) return;

  const rawToken = generateResetToken();
  const tokenHash = sha256Hex(rawToken);
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')`,
    [user.id, tokenHash]
  );

  const link = `${env.APP_URL}/reset-password?token=${rawToken}`;
  await sendMail({
    to: user.email,
    subject: "Reset your password",
    html: `<p>Reset your password: <a href="${link}">${link}</a></p><p>This link expires in 1 hour.</p>`,
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = sha256Hex(token);
  const { rows } = await pool.query<{
    id: string;
    user_id: string;
    expires_at: string;
    consumed_at: string | null;
  }>(`SELECT id, user_id, expires_at, consumed_at FROM password_reset_tokens WHERE token_hash = $1`, [tokenHash]);
  const row = rows[0];
  if (!row) throw new ApiError(400, "INVALID_TOKEN", "This reset link is invalid");
  if (row.consumed_at) throw new ApiError(410, "TOKEN_USED", "This reset link has already been used");
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new ApiError(410, "TOKEN_EXPIRED", "This reset link has expired");
  }

  const passwordHash = await hashPassword(newPassword);
  await pool.query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [row.user_id, passwordHash]);
  await pool.query(`UPDATE password_reset_tokens SET consumed_at = now() WHERE id = $1`, [row.id]);
}
```

- [ ] **Step 4: Wire the controller and routes**

Add to `backend/src/modules/auth/auth.controller.ts`:

```ts
const forgotPasswordSchema = z.object({ email: z.string().email() });
const resetPasswordSchema = z.object({ token: z.string().min(1), password: z.string().min(8).max(72) });

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    await authService.forgotPassword(email);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(token, password);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}
```

Add to `backend/src/modules/auth/auth.routes.ts` (import the two new handlers and register the routes):

```ts
import {
  forgotPassword,
  login,
  logout,
  me,
  refresh,
  register,
  resendOtp,
  resetPassword,
  verifyEmail,
} from "./auth.controller.js";

// ...
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);
```

- [ ] **Step 5: Run tests to verify pass**

```bash
cd backend
npm test -- auth.test.ts
```

Expected: PASS.

- [ ] **Step 6: Full suite**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/auth backend/tests/modules/auth.test.ts
git commit -m "feat(auth): add forgot-password / reset-password via emailed link"
```

---

## Task 5: Google OAuth (redirect, callback, pending-profile completion)

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts`
- Modify: `backend/src/modules/auth/auth.controller.ts`
- Modify: `backend/src/modules/auth/auth.routes.ts`
- Modify: `backend/tests/modules/auth.test.ts`

**Interfaces:**
- Consumes from Task 2: `signOAuthState`, `verifyOAuthState`, `signOAuthPending`, `verifyOAuthPending`, `env.GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, `env.APP_URL`.
- Produces: `authService.googleAuthUrl(): string`; `authService.handleGoogleCallback(code, state): Promise<GoogleCallbackResult>` where `type GoogleCallbackResult = { kind: "session"; tokens: TokenPair } | { kind: "pending"; pendingToken: string }`; `authService.completeGoogleSignup(pendingToken, branchId): Promise<{ user: User; tokens: TokenPair }>`. Routes: `GET /api/auth/google` (302), `GET /api/auth/google/callback` (302), `POST /api/auth/google/complete`.

- [ ] **Step 1: Write the failing tests**

These mock `global.fetch` (used to call Google's token/userinfo endpoints) rather than hitting the real network. Add to `backend/tests/modules/auth.test.ts`:

```ts
describe("GET /api/auth/google", () => {
  it("redirects to Google's consent screen with a state param", async () => {
    const res = await request(app).get("/api/auth/google");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("accounts.google.com");
    expect(res.headers.location).toContain("state=");
  });
});

describe("GET /api/auth/google/callback", () => {
  function mockGoogle(profile: { sub: string; email: string; email_verified: boolean; name: string }) {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "fake-google-token" }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => profile } as Response);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects to /oauth/complete for a brand-new identity", async () => {
    const stateRes = await request(app).get("/api/auth/google");
    const state = new URL(stateRes.headers.location).searchParams.get("state")!;
    mockGoogle({ sub: "google-new-1", email: "newgoogle@test.edu", email_verified: true, name: "New Googler" });

    const res = await request(app).get(`/api/auth/google/callback?code=fake-code&state=${state}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/oauth/complete#pending=");
  });

  it("redirects to /oauth/callback with a session for a known provider identity", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await pool.query(
      `INSERT INTO users (email, full_name, auth_provider, provider_user_id, role, branch_id, email_verified)
       VALUES ('known-google@test.edu', 'Known Googler', 'google', 'google-known-1', 'student', $1, true)`,
      [branch.id]
    );
    const stateRes = await request(app).get("/api/auth/google");
    const state = new URL(stateRes.headers.location).searchParams.get("state")!;
    mockGoogle({ sub: "google-known-1", email: "known-google@test.edu", email_verified: true, name: "Known Googler" });

    const res = await request(app).get(`/api/auth/google/callback?code=fake-code&state=${state}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/oauth/callback#accessToken=");
  });

  it("links to an existing verified-email password account instead of creating a duplicate", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user } = await createUserFixture({
      role: "student",
      branchId: branch.id,
      email: "link-me@test.edu",
      emailVerified: true,
    });
    const stateRes = await request(app).get("/api/auth/google");
    const state = new URL(stateRes.headers.location).searchParams.get("state")!;
    mockGoogle({ sub: "google-link-1", email: "link-me@test.edu", email_verified: true, name: "Link Me" });

    const res = await request(app).get(`/api/auth/google/callback?code=fake-code&state=${state}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/oauth/callback#accessToken=");

    const { rows } = await pool.query(`SELECT auth_provider, provider_user_id FROM users WHERE id = $1`, [user.id]);
    expect(rows[0].auth_provider).toBe("google");
    expect(rows[0].provider_user_id).toBe("google-link-1");
  });

  it("does NOT link when Google reports the email as unverified", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user } = await createUserFixture({
      role: "student",
      branchId: branch.id,
      email: "unverified-link@test.edu",
      emailVerified: true,
    });
    const stateRes = await request(app).get("/api/auth/google");
    const state = new URL(stateRes.headers.location).searchParams.get("state")!;
    mockGoogle({ sub: "google-unverified-1", email: "unverified-link@test.edu", email_verified: false, name: "Unverified" });

    const res = await request(app).get(`/api/auth/google/callback?code=fake-code&state=${state}`);
    expect(res.headers.location).toContain("/oauth/complete#pending=");

    const { rows } = await pool.query(`SELECT auth_provider FROM users WHERE id = $1`, [user.id]);
    expect(rows[0].auth_provider).toBeNull();
  });

  it("redirects to /login?error=oauth_failed on an invalid state", async () => {
    const res = await request(app).get(`/api/auth/google/callback?code=fake-code&state=garbage`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/login?error=oauth_failed");
  });
});

describe("POST /api/auth/google/complete", () => {
  it("creates a verified, password-less account and returns tokens", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const pendingToken = signOAuthPending({
      provider: "google",
      providerUserId: "google-complete-1",
      email: "complete@test.edu",
      fullName: "Complete Me",
    });

    const res = await request(app)
      .post("/api/auth/google/complete")
      .send({ pendingToken, branch_id: branch.id });

    expect(res.status).toBe(201);
    expect(res.body.data.user.email_verified).toBe(true);
    expect(typeof res.body.data.accessToken).toBe("string");
  });

  it("rejects an invalid pending token with 400", async () => {
    const res = await request(app)
      .post("/api/auth/google/complete")
      .send({ pendingToken: "garbage", branch_id: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });
});
```

Add the `signOAuthPending` import at the top of the test file:

```ts
import { signOAuthPending } from "../../src/lib/jwt.js";
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend
npm test -- auth.test.ts
```

Expected: FAIL — routes don't exist.

- [ ] **Step 3: Implement the service functions**

Add to `backend/src/modules/auth/auth.service.ts`. Extend the `jwt.js` import to include the four OAuth helpers:

```ts
import {
  signOAuthPending,
  signOAuthState,
  signTokenPair,
  verifyOAuthPending,
  verifyOAuthState,
  verifyRefreshToken,
  type JwtPayload,
  type TokenPair,
} from "../../lib/jwt.js";
```

Then:

```ts
export function googleAuthUrl(): string {
  const state = signOAuthState();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
}

async function fetchGoogleProfile(code: string): Promise<GoogleProfile> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw new ApiError(400, "OAUTH_FAILED", "Google token exchange failed");
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!profileRes.ok) throw new ApiError(400, "OAUTH_FAILED", "Fetching Google profile failed");
  return (await profileRes.json()) as GoogleProfile;
}

export type GoogleCallbackResult = { kind: "session"; tokens: TokenPair } | { kind: "pending"; pendingToken: string };

export async function handleGoogleCallback(code: string, state: string): Promise<GoogleCallbackResult> {
  verifyOAuthState(state); // throws on invalid/expired/wrong-purpose state

  const profile = await fetchGoogleProfile(code);

  const { rows: byProvider } = await pool.query<User>(
    `SELECT ${USER_COLUMNS} FROM users WHERE auth_provider = 'google' AND provider_user_id = $1`,
    [profile.sub]
  );
  if (byProvider[0]) {
    return { kind: "session", tokens: signTokenPair(toPayload(byProvider[0])) };
  }

  if (profile.email_verified) {
    const { rows: byEmail } = await pool.query<User>(
      `UPDATE users SET auth_provider = 'google', provider_user_id = $2, updated_at = now()
       WHERE email = $1 AND auth_provider IS NULL
       RETURNING ${USER_COLUMNS}`,
      [profile.email, profile.sub]
    );
    if (byEmail[0]) {
      return { kind: "session", tokens: signTokenPair(toPayload(byEmail[0])) };
    }
  }

  const pendingToken = signOAuthPending({
    provider: "google",
    providerUserId: profile.sub,
    email: profile.email,
    fullName: profile.name,
  });
  return { kind: "pending", pendingToken };
}

export async function completeGoogleSignup(
  pendingToken: string,
  branchId: string
): Promise<{ user: User; tokens: TokenPair }> {
  let pending;
  try {
    pending = verifyOAuthPending(pendingToken);
  } catch {
    throw new ApiError(400, "INVALID_TOKEN", "This sign-up link is invalid or has expired");
  }

  try {
    const { rows } = await pool.query<User>(
      `INSERT INTO users (email, full_name, auth_provider, provider_user_id, role, branch_id, email_verified)
       VALUES ($1, $2, $3, $4, 'student', $5, true)
       RETURNING ${USER_COLUMNS}`,
      [pending.email, pending.fullName, pending.provider, pending.providerUserId, branchId]
    );
    const user = rows[0]!;
    return { user, tokens: signTokenPair(toPayload(user)) };
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
```

- [ ] **Step 4: Wire the controller and routes**

Add to `backend/src/modules/auth/auth.controller.ts` (needs `import { env } from "../../config/env.js";`):

```ts
const googleCompleteSchema = z.object({
  pendingToken: z.string().min(1),
  branch_id: z.string().uuid(),
});

export function googleRedirect(_req: Request, res: Response) {
  res.redirect(authService.googleAuthUrl());
}

export async function googleCallback(req: Request, res: Response) {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  try {
    const result = await authService.handleGoogleCallback(code, state);
    if (result.kind === "session") {
      res.redirect(
        `${env.APP_URL}/oauth/callback#accessToken=${result.tokens.accessToken}&refreshToken=${result.tokens.refreshToken}`
      );
    } else {
      res.redirect(`${env.APP_URL}/oauth/complete#pending=${result.pendingToken}`);
    }
  } catch {
    // Never leak provider/error details to the browser — a generic bounce
    // back to login with a flag the frontend turns into a toast.
    res.redirect(`${env.APP_URL}/login?error=oauth_failed`);
  }
}

export async function googleComplete(req: Request, res: Response, next: NextFunction) {
  try {
    const { pendingToken, branch_id } = googleCompleteSchema.parse(req.body);
    const { user, tokens } = await authService.completeGoogleSignup(pendingToken, branch_id);
    sendSuccess(res, { user, ...tokens }, 201);
  } catch (err) {
    next(err);
  }
}
```

Add to `backend/src/modules/auth/auth.routes.ts`:

```ts
import {
  forgotPassword,
  googleCallback,
  googleComplete,
  googleRedirect,
  login,
  logout,
  me,
  refresh,
  register,
  resendOtp,
  resetPassword,
  verifyEmail,
} from "./auth.controller.js";

// ...
authRouter.get("/google", googleRedirect);
authRouter.get("/google/callback", googleCallback);
authRouter.post("/google/complete", googleComplete);
```

- [ ] **Step 5: Run tests to verify pass**

```bash
cd backend
npm test -- auth.test.ts
```

Expected: PASS.

- [ ] **Step 6: Full suite + typecheck**

```bash
npm run typecheck
npm test
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/auth backend/tests/modules/auth.test.ts
git commit -m "feat(auth): add Google OAuth sign-in with pending-profile signup"
```

---

## Task 6: Password-visibility toggle

**Files:**
- Create: `frontend/src/components/ui/password-input.tsx`
- Create: `frontend/src/components/ui/password-input.test.tsx`
- Modify: `frontend/src/features/auth/LoginForm.tsx`
- Modify: `frontend/src/features/auth/RegisterForm.tsx`

**Interfaces:**
- Produces: `<PasswordInput>` — a drop-in replacement for `<Input type="password">`, same props (`React.ComponentProps<"input">` minus `type`, which it controls internally).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/ui/password-input.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { PasswordInput } from "./password-input";

describe("PasswordInput", () => {
  it("starts masked and toggles to visible text on click", async () => {
    renderWithProviders(<PasswordInput aria-label="Password" />);
    const input = screen.getByLabelText(/password/i);
    expect(input).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: /show password/i }));
    expect(input).toHaveAttribute("type", "text");

    await userEvent.click(screen.getByRole("button", { name: /hide password/i }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("does not submit an enclosing form when the toggle is clicked", async () => {
    let submitted = false;
    renderWithProviders(
      <form onSubmit={() => (submitted = true)}>
        <PasswordInput aria-label="Password" />
      </form>
    );

    await userEvent.click(screen.getByRole("button", { name: /show password/i }));
    expect(submitted).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend
npm test -- password-input
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `PasswordInput`**

Create `frontend/src/components/ui/password-input.tsx`:

```tsx
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "./input";

export function PasswordInput({ className, ...props }: React.ComponentProps<"input">) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} className={cn("pr-9", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-2 flex items-center text-text-muted"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
```

`type="button"` is load-bearing: without it, a button inside a `<form>` defaults to `type="submit"` and clicking it submits the form.

- [ ] **Step 4: Run to verify pass**

```bash
cd frontend
npm test -- password-input
```

Expected: PASS.

- [ ] **Step 5: Wire into `LoginForm` and `RegisterForm`**

In `frontend/src/features/auth/LoginForm.tsx`, replace the `Input` import with `PasswordInput` for the password field:

```tsx
import { PasswordInput } from "@/components/ui/password-input";
```

```tsx
        <PasswordInput
          id="login-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
```

(Drop `type="password"` — `PasswordInput` owns it.) `Input` may still be imported for the email field; leave that import alone if still used elsewhere in the file, otherwise remove it.

Apply the same substitution in `frontend/src/features/auth/RegisterForm.tsx` for `register-password`:

```tsx
        <PasswordInput
          id="register-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
```

- [ ] **Step 6: Run the existing auth frontend tests**

```bash
cd frontend
npm test -- auth.test.tsx
```

Expected: PASS — `getByLabelText(/password/i)` still resolves (the `<Label htmlFor="login-password">` / `id="login-password"` pairing is unchanged; `PasswordInput` forwards `id` straight to the underlying `<Input>`).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ui/password-input.tsx frontend/src/components/ui/password-input.test.tsx \
        frontend/src/features/auth/LoginForm.tsx frontend/src/features/auth/RegisterForm.tsx
git commit -m "feat(frontend): add password visibility toggle to auth forms"
```

---

## Task 7: Frontend — signup verification, forgot/reset password

**Files:**
- Modify: `frontend/src/features/auth/auth-context.ts`
- Modify: `frontend/src/features/auth/AuthProvider.tsx`
- Modify: `frontend/src/features/auth/RegisterForm.tsx`
- Modify: `frontend/src/routes/RegisterPage.tsx`
- Create: `frontend/src/routes/VerifyEmailPage.tsx`
- Create: `frontend/src/routes/ForgotPasswordPage.tsx`
- Create: `frontend/src/routes/ResetPasswordPage.tsx`
- Modify: `frontend/src/routes/LoginPage.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/lib/api-types.ts`
- Modify: `frontend/src/features/auth/auth.test.tsx`

**Interfaces:**
- Consumes from Task 6: `PasswordInput`.
- Produces on `AuthContextValue`: `register(input): Promise<{ needsVerification: boolean; email: string }>` (breaking change — was `Promise<void>`), `verifyEmail(email: string, code: string): Promise<void>`, `resendOtp(email: string): Promise<void>`, `forgotPassword(email: string): Promise<void>`, `resetPassword(token: string, password: string): Promise<void>`. Routes `/verify-email`, `/forgot-password`, `/reset-password`.

- [ ] **Step 1: Add the new response type**

Edit `frontend/src/lib/api-types.ts`, add `email_verified` to `User` (mirrors the backend type from Task 3) and a new `RegisterPayload`:

```ts
export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  program_id: string | null;
  branch_id: string | null;
  enrollment_year: number | null;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}
```

```ts
export interface RegisterPayload {
  user: User;
  needsVerification: boolean;
}
```

- [ ] **Step 2: Write the failing tests**

Add to `frontend/src/features/auth/auth.test.tsx`:

```tsx
import { RegisterForm } from "./RegisterForm";
```

```tsx
describe("register", () => {
  it("does not authenticate immediately — reports needsVerification instead", async () => {
    server.use(
      http.post(`${API}/api/auth/register`, () =>
        HttpResponse.json({
          success: true,
          data: { user: { ...student, email_verified: false }, needsVerification: true },
        })
      ),
      http.get(`${API}/api/programs`, () =>
        HttpResponse.json({ success: true, data: { items: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } } })
      )
    );

    let captured: { needsVerification: boolean; email: string } | undefined;

    function Harness() {
      return (
        <RegisterForm
          onRegistered={(email) => {
            captured = { needsVerification: true, email };
          }}
        />
      );
    }

    renderWithProviders(<Harness />);

    await userEvent.type(screen.getByLabelText(/full name/i), "New Student");
    await userEvent.type(screen.getByLabelText(/email/i), "new@test.edu");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await new Promise((r) => setTimeout(r, 0));
    expect(captured?.email).toBe("new@test.edu");
    expect(localStorage.getItem("refreshToken")).toBeNull();
  });
});
```

(This test only exercises the `RegisterForm` -> `onRegistered` contract; branch/program pickers are already covered by pre-existing tests for that component if any exist — this plan doesn't duplicate that coverage, it only asserts the new no-immediate-session behavior.)

- [ ] **Step 3: Run to verify failure**

```bash
cd frontend
npm test -- auth.test.tsx
```

Expected: FAIL — `RegisterForm` doesn't accept `onRegistered` yet, and `register()` still calls `onSuccess` with no email.

- [ ] **Step 4: Update `auth-context.ts`**

```ts
export interface RegisterInput {
  email: string;
  password: string;
  full_name: string;
  branch_id: string;
}

export interface RegisterResult {
  needsVerification: boolean;
  email: string;
}

export interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<RegisterResult>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendOtp: (email: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  applyOAuthSession: () => Promise<void>;
  completeOAuthProfile: (pendingToken: string, branchId: string) => Promise<void>;
  logout: () => void;
}
```

(`applyOAuthSession` and `completeOAuthProfile` are declared here now so this file only needs editing once; they're implemented in Task 8 alongside the pages that call them. Until Task 8, `AuthProvider` must still provide stub implementations so the app compiles — see Step 5.)

- [ ] **Step 5: Update `AuthProvider.tsx`**

Replace `register`:

```tsx
  const register = useCallback(async (input: RegisterInput) => {
    const result = await api.post<{ user: User; needsVerification: boolean }>("/api/auth/register", input);
    return { needsVerification: result.needsVerification, email: input.email };
  }, []);
```

Add alongside it (same file, near `login`):

```tsx
  const verifyEmail = useCallback(
    async (email: string, code: string) => {
      applySession(await api.post<AuthPayload>("/api/auth/verify-email", { email, code }));
    },
    [applySession]
  );

  const resendOtp = useCallback(async (email: string) => {
    await api.post("/api/auth/resend-otp", { email });
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    await api.post("/api/auth/forgot-password", { email });
  }, []);

  const resetPassword = useCallback(async (token: string, password: string) => {
    await api.post("/api/auth/reset-password", { token, password });
  }, []);
```

`applyOAuthSession` and `completeOAuthProfile` are added in Task 8 — for this task, add temporary throwing stubs so the type from Step 4 is satisfied and the app still compiles:

```tsx
  const applyOAuthSession = useCallback(async () => {
    throw new Error("not implemented until Task 8");
  }, []);

  const completeOAuthProfile = useCallback(async () => {
    throw new Error("not implemented until Task 8");
  }, []);
```

Update the `useMemo` dependency array and returned object:

```tsx
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      login,
      register,
      verifyEmail,
      resendOtp,
      forgotPassword,
      resetPassword,
      applyOAuthSession,
      completeOAuthProfile,
      logout,
    }),
    [user, status, login, register, verifyEmail, resendOtp, forgotPassword, resetPassword, applyOAuthSession, completeOAuthProfile, logout]
  );
```

- [ ] **Step 6: Update `RegisterForm.tsx`**

Change the prop and success handling:

```tsx
export function RegisterForm({ onRegistered }: { onRegistered?: (email: string) => void }) {
  const { register } = useAuth();
  // ...unchanged state...

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setPending(true);
    try {
      const result = await register({ email, password, full_name: fullName, branch_id: branchId });
      onRegistered?.(result.email);
    } catch (err) {
      // ...unchanged...
    } finally {
      setPending(false);
    }
  }
  // ...unchanged JSX...
}
```

- [ ] **Step 7: Update `RegisterPage.tsx`**

```tsx
import { Link, Navigate, useNavigate } from "react-router-dom";
import { RegisterForm } from "@/features/auth/RegisterForm";
import { useAuth } from "@/features/auth/useAuth";

export function RegisterPage() {
  const { status } = useAuth();
  const navigate = useNavigate();

  if (status === "authenticated") return <Navigate to="/home" replace />;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-12">
      <h1 className="text-title font-bold">Create an account</h1>
      <RegisterForm onRegistered={(email) => navigate(`/verify-email?email=${encodeURIComponent(email)}`)} />
      <p className="text-ui text-text-muted">
        Already have one?{" "}
        <Link to="/login" className="underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 8: Create `VerifyEmailPage.tsx`**

```tsx
import { AlertCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/features/auth/useAuth";

export function VerifyEmailPage() {
  const { verifyEmail, resendOtp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await verifyEmail(email, code);
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleResend() {
    setError(null);
    try {
      await resendOtp(email);
      setResendCooldown(60);
      const interval = setInterval(() => {
        setResendCooldown((s) => {
          if (s <= 1) {
            clearInterval(interval);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-12">
      <h1 className="text-title font-bold">Verify your email</h1>
      <p className="text-ui text-text-muted">We sent a 6-digit code to {email}.</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="verify-code">Verification code</Label>
          <Input
            id="verify-code"
            required
            maxLength={6}
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Verifying…" : "Verify"}
        </Button>
      </form>
      <Button type="button" variant="ghost" disabled={resendCooldown > 0} onClick={handleResend}>
        {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
      </Button>
    </div>
  );
}
```

(`variant="ghost"` is a real variant on `Button` — see `frontend/src/components/ui/button.tsx`'s `buttonVariants` — so no substitution is needed.)

- [ ] **Step 9: Create `ForgotPasswordPage.tsx`**

```tsx
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/useAuth";

export function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await forgotPassword(email);
    } finally {
      setPending(false);
      // Always show the same message, whether or not the account exists —
      // the backend already never reveals which (see auth.service.ts).
      setSubmitted(true);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-12">
      <h1 className="text-title font-bold">Forgot password</h1>
      {submitted ? (
        <p className="text-ui text-text-muted">If an account exists for that email, we sent a reset link.</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="forgot-email">Email</Label>
            <Input
              id="forgot-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <p className="text-ui text-text-muted">
        <Link to="/login" className="underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 10: Create `ResetPasswordPage.tsx`**

```tsx
import { AlertCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/features/auth/useAuth";

export function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await resetPassword(token, password);
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-12">
      <h1 className="text-title font-bold">Reset password</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reset-password">New password</Label>
          <PasswordInput
            id="reset-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Resetting…" : "Reset password"}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 11: Add a "Forgot password?" link to `LoginPage.tsx`**

```tsx
      <p className="text-ui text-text-muted">
        No account?{" "}
        <Link to="/register" className="underline">
          Create one
        </Link>
      </p>
      <p className="text-ui text-text-muted">
        <Link to="/forgot-password" className="underline">
          Forgot password?
        </Link>
      </p>
```

- [ ] **Step 12: Wire the three new routes into `router.tsx`**

```tsx
import { ForgotPasswordPage } from "@/routes/ForgotPasswordPage";
import { ResetPasswordPage } from "@/routes/ResetPasswordPage";
import { VerifyEmailPage } from "@/routes/VerifyEmailPage";
```

```tsx
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
```

- [ ] **Step 13: Run tests to verify pass**

```bash
cd frontend
npm test -- auth.test.tsx
npm run typecheck
```

Expected: both PASS.

- [ ] **Step 14: Full frontend suite**

```bash
npm test
```

Expected: PASS. If `RegisterForm`'s own dedicated test file (if one exists) still references `onSuccess`, update it to `onRegistered` following the same pattern as Step 6.

- [ ] **Step 15: Commit**

```bash
git add frontend/src/features/auth frontend/src/routes frontend/src/app/router.tsx frontend/src/lib/api-types.ts
git commit -m "feat(frontend): add signup verification and forgot/reset password flows"
```

---

## Task 8: Frontend — Google OAuth callback/complete pages and sign-in button

**Files:**
- Modify: `frontend/src/features/auth/AuthProvider.tsx`
- Create: `frontend/src/routes/OAuthCallbackPage.tsx`
- Create: `frontend/src/routes/OAuthCompletePage.tsx`
- Modify: `frontend/src/routes/LoginPage.tsx`
- Modify: `frontend/src/routes/RegisterPage.tsx`
- Modify: `frontend/src/lib/api-client.ts`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/features/auth/auth.test.tsx`

**Interfaces:**
- Consumes from Task 7: `AuthContextValue.applyOAuthSession`, `AuthContextValue.completeOAuthProfile` (stub bodies replaced here with real implementations).
- Produces: `API_BASE_URL` exported from `api-client.ts`; routes `/oauth/callback`, `/oauth/complete`.

- [ ] **Step 1: Export the API base URL**

Edit `frontend/src/lib/api-client.ts` — the module already computes `BASE_URL`; export it:

```ts
export const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
```

(This just adds `export` to the existing `const BASE_URL = ...` line — no behavior change.)

- [ ] **Step 2: Write the failing test**

Add to `frontend/src/features/auth/auth.test.tsx`:

```tsx
import { OAuthCallbackPage } from "@/routes/OAuthCallbackPage";
```

```tsx
describe("OAuth callback", () => {
  it("reads tokens from the URL fragment and authenticates", async () => {
    server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json({ success: true, data: student })));

    window.location.hash = "accessToken=abc&refreshToken=def";

    renderWithProviders(
      <>
        <OAuthCallbackPage />
        <WhoAmI />
      </>
    );

    expect(await screen.findByText("hello Student")).toBeInTheDocument();
    expect(localStorage.getItem("refreshToken")).toBe("def");
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
cd frontend
npm test -- auth.test.tsx
```

Expected: FAIL — `OAuthCallbackPage` doesn't exist and `applyOAuthSession` is a throwing stub.

- [ ] **Step 4: Implement `applyOAuthSession` and `completeOAuthProfile` in `AuthProvider.tsx`**

Replace the Task 7 stubs:

```tsx
  const applyOAuthSession = useCallback(
    async (accessToken: string, refreshToken: string) => {
      setAccessToken(accessToken);
      refreshTokenRef.current = refreshToken;
      writeStoredRefreshToken(refreshToken);
      queryClient.clear();
      const me = await api.get<User>("/api/auth/me");
      setUser(me);
      setStatus("authenticated");
    },
    [queryClient]
  );

  const completeOAuthProfile = useCallback(
    async (pendingToken: string, branchId: string) => {
      applySession(
        await api.post<AuthPayload>("/api/auth/google/complete", { pendingToken, branch_id: branchId })
      );
    },
    [applySession]
  );
```

Update the type in `auth-context.ts` for `applyOAuthSession` (it now takes two args, not zero — the Task 7 placeholder type was wrong on purpose to force this correction):

```ts
  applyOAuthSession: (accessToken: string, refreshToken: string) => Promise<void>;
```

- [ ] **Step 5: Create `OAuthCallbackPage.tsx`**

```tsx
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/useAuth";

export function OAuthCallbackPage() {
  const { applyOAuthSession } = useAuth();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");
    // Strip the fragment immediately so the tokens don't linger in browser
    // history/back-forward cache.
    window.history.replaceState(null, "", window.location.pathname);

    if (!accessToken || !refreshToken) {
      navigate("/login?error=oauth_failed", { replace: true });
      return;
    }

    applyOAuthSession(accessToken, refreshToken)
      .then(() => navigate("/home", { replace: true }))
      .catch(() => navigate("/login?error=oauth_failed", { replace: true }));
  }, [applyOAuthSession, navigate]);

  return <p className="mx-auto max-w-sm py-12 text-center text-ui text-text-muted">Signing you in…</p>;
}
```

- [ ] **Step 6: Create `OAuthCompletePage.tsx`**

Reuses the same program->branch picker pattern as `RegisterForm`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useBranches, usePrograms } from "@/features/taxonomy/queries";
import { useAuth } from "@/features/auth/useAuth";
import { PICKER_LIMIT } from "@/lib/query-keys";

export function OAuthCompletePage() {
  const { completeOAuthProfile } = useAuth();
  const navigate = useNavigate();
  const [programId, setProgramId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const programs = usePrograms(1, PICKER_LIMIT);
  const branches = useBranches(programId, 1, PICKER_LIMIT);

  const pendingToken = new URLSearchParams(window.location.hash.slice(1)).get("pending") ?? "";

  const selectClass =
    "rounded-control bg-surface px-2.5 py-1.5 text-ui outline-none focus-visible:ring-2 focus-visible:ring-ring";

  async function handleSubmit() {
    setError(null);
    setPending(true);
    try {
      await completeOAuthProfile(pendingToken, branchId);
      window.history.replaceState(null, "", window.location.pathname);
      navigate("/home", { replace: true });
    } catch {
      setError("Something went wrong finishing sign-up. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-12">
      <h1 className="text-title font-bold">One more step</h1>
      <p className="text-ui text-text-muted">Tell us your branch to finish creating your account.</p>

      <label className="flex flex-col gap-1.5">
        <span className="text-caption text-text-muted">Program</span>
        <select
          required
          value={programId}
          onChange={(e) => {
            setProgramId(e.target.value);
            setBranchId("");
          }}
          className={selectClass}
        >
          <option value="">Select a program</option>
          {programs.data?.items.map((program) => (
            <option key={program.id} value={program.id}>
              {program.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-caption text-text-muted">Branch</span>
        <select
          required
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          disabled={!programId}
          className={selectClass}
        >
          <option value="">{programId ? "Select a branch" : "Pick a program first"}</option>
          {branches.data?.items.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-caption text-status-rejected-fg">{error}</p>}

      <Button type="button" disabled={pending || !branchId} onClick={handleSubmit}>
        {pending ? "Finishing…" : "Finish sign up"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 7: Add the Google sign-in link to `LoginPage.tsx` and `RegisterPage.tsx`**

This is a plain anchor (full page navigation), not a `fetch` — the backend redirect flow requires the browser to actually follow Google's redirect chain. Add to `LoginPage.tsx`, inside the returned JSX, above or below `<LoginForm>`:

```tsx
import { BASE_URL } from "@/lib/api-client";
```

```tsx
      <a
        href={`${BASE_URL}/api/auth/google`}
        className="rounded-control bg-surface px-3 py-2 text-center text-ui outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Continue with Google
      </a>
```

Add the identical block (same import, same anchor) to `RegisterPage.tsx`.

- [ ] **Step 8: Wire the two new routes into `router.tsx`**

```tsx
import { OAuthCallbackPage } from "@/routes/OAuthCallbackPage";
import { OAuthCompletePage } from "@/routes/OAuthCompletePage";
```

```tsx
        <Route path="oauth/callback" element={<OAuthCallbackPage />} />
        <Route path="oauth/complete" element={<OAuthCompletePage />} />
```

- [ ] **Step 9: Run tests to verify pass**

```bash
cd frontend
npm test -- auth.test.tsx
npm run typecheck
```

Expected: both PASS.

- [ ] **Step 10: Full frontend suite, then full backend suite one more time**

```bash
npm test
cd ../backend && npm test
```

Expected: both PASS — this is the final cross-check that nothing in either app regressed across all eight tasks.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/features/auth frontend/src/routes frontend/src/lib/api-client.ts frontend/src/app/router.tsx
git commit -m "feat(frontend): add Google OAuth callback/complete pages and sign-in button"
```

---

## Manual verification (not automated — do once, locally, before considering this done)

1. Create real Google OAuth credentials (Google Cloud Console -> APIs & Services -> Credentials), set `GOOGLE_REDIRECT_URI` to `http://localhost:4000/api/auth/google/callback`, add that same URL to the credential's "Authorized redirect URIs".
2. Configure real SMTP creds (or a provider like Mailtrap for a safe sandbox) in `backend/.env`.
3. Run both dev servers, click "Continue with Google" on `/login` with a fresh Google account, complete the branch picker, confirm you land on `/home` authenticated.
4. Register with a real email you can read, confirm the OTP email arrives, verify, confirm login is blocked before verifying and works after.
5. Use "Forgot password?", confirm the reset email arrives, click the link, set a new password, log in with it.
6. Toggle password visibility on login, register, and reset-password forms.
