# Auth, RBAC, API Conventions, and Notes Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add JWT auth + RBAC middleware, bring the API onto a standard response envelope with pagination, and fully wire the `notes` module (CRUD, moderation, S3 two-phase upload) on top of the existing Express + TypeScript + `pg` backend and its already-migrated Postgres schema.

**Architecture:** Layered Express modules (`routes → controller → service → pg`), matching the existing `programs` module pattern. Shared cross-cutting concerns (response envelope, pagination, JWT, password hashing, S3 presigning, RBAC) live in `src/lib/` and `src/middleware/` so every module composes them rather than reimplementing them.

**Tech Stack:** Node.js, TypeScript (ESM), Express 4, `pg`, `zod`, `jsonwebtoken`, `bcrypt`, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, `vitest` + `supertest` for tests.

**Spec:** `docs/superpowers/specs/2026-09-02-auth-rbac-notes-design.md`

## Global Constraints

- No schema changes. Every column/table/enum/constraint needed already exists in `db/migrations/000001_initial_schema.up.sql`. If a genuine gap is found mid-implementation, stop and write a new `000002_*` migration — never edit `000001`.
- No `/api/v1` prefix. Routes stay `/api/<resource>`.
- Response envelope: success = `{ success: true, data }`; error = `{ success: false, error: { code, message } }`.
- RBAC hierarchy stays exactly as it exists today: `superuser > program_admin > branch_admin > student`. No new roles, no departments/sections.
- Password hashing: **bcrypt**, salt rounds from `BCRYPT_SALT_ROUNDS` env var.
- Refresh tokens: **stateless JWT**, returned in the response body, no DB table, no revocation.
- Config only from environment variables, validated by the existing zod schema in `src/config/env.ts` (fails fast on boot).
- Every list endpoint is paginated (`page`, `limit`, response `data.pagination`).
- Follow the existing project layout exactly: `src/modules/<resource>/{<resource>.routes.ts,<resource>.controller.ts,<resource>.service.ts}`, mounted in `src/app.ts`.
- Every DB query is parameterized (`$1, $2, ...`) — never string-interpolate user input into SQL.

---

## Task 1: Test infrastructure and dependencies

**Files:**
- Modify: `backend/package.json`
- Create: `backend/vitest.config.ts`
- Create: `backend/.env.test.example`
- Create: `backend/tests/setup.ts`
- Create: `backend/tests/helpers/db.ts`
- Create: `backend/tests/helpers/fixtures.ts`
- Create: `backend/.gitignore` entry (verify `.env.test` is ignored — check existing `.gitignore` first)

**Interfaces:**
- Produces: `truncateAll(): Promise<void>` from `tests/helpers/db.ts`; `createProgram`, `createBranch`, `createSubject`, `createUserFixture` from `tests/helpers/fixtures.ts` — every later task's integration tests import these.

- [ ] **Step 1: Add dependencies and the test script to `backend/package.json`**

Replace the file's `scripts`, `dependencies`, and `devDependencies` blocks:

```json
{
  "name": "college-notes-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.658.1",
    "@aws-sdk/s3-request-presigner": "^3.658.1",
    "bcrypt": "^5.1.1",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.1",
    "helmet": "^8.0.0",
    "jsonwebtoken": "^9.0.2",
    "morgan": "^1.10.0",
    "pg": "^8.13.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/morgan": "^1.9.9",
    "@types/node": "^22.10.2",
    "@types/pg": "^8.11.10",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.4"
  }
}
```

Run: `cd backend && npm install`
Expected: installs clean, 0 errors.

- [ ] **Step 2: Check `.gitignore` covers `.env.test`**

Run: `cat "/media/aryan/New Volume/projects/revisex-v2/.gitignore"`

If `.env` is listed but `.env.test` is not covered by a pattern like `.env*` or `**/.env*`, add a line `backend/.env.test` (or broaden the existing `.env` pattern to `.env*` if that doesn't also ignore `.env.example`/`.env.test.example` — check the exact pattern before editing, since `.example` files must stay tracked).

- [ ] **Step 3: Create `backend/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
```

- [ ] **Step 4: Create `backend/.env.test.example`**

```
NODE_ENV=test
PORT=4001
CORS_ORIGIN=http://localhost:5173

# Points at db/'s local Docker sandbox (docker-compose.yml), NOT Neon.
# Run `make -C ../db local-reset` once before running tests.
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/college_notes?sslmode=disable

JWT_ACCESS_SECRET=test-access-secret-change-me-please-32-chars-min
JWT_REFRESH_SECRET=test-refresh-secret-change-me-please-32-chars-min
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# Low rounds keep the test suite fast — never use this value outside tests.
BCRYPT_SALT_ROUNDS=4

AWS_REGION=us-east-1
AWS_S3_BUCKET=test-bucket
```

Then: `cp backend/.env.test.example backend/.env.test`

- [ ] **Step 5: Create `backend/tests/setup.ts`**

```typescript
import { config as loadDotenv } from "dotenv";

// Must run before any test file imports src/config/env.ts, since that module
// calls its own loadDotenv() (default .env) at import time — dotenv does not
// override already-set process.env values, so setting these first means the
// test values win without editing config/env.ts for a test-only concern.
loadDotenv({ path: ".env.test" });
```

- [ ] **Step 6: Create `backend/tests/helpers/db.ts`**

```typescript
import { pool } from "../../src/config/db.js";

export async function truncateAll(): Promise<void> {
  await pool.query(
    `TRUNCATE TABLE files, notes, subjects, branches, programs, users RESTART IDENTITY CASCADE`
  );
}
```

- [ ] **Step 7: Create `backend/tests/helpers/fixtures.ts`**

```typescript
import bcrypt from "bcrypt";
import { pool } from "../../src/config/db.js";
import type { UserRole } from "../../src/types/index.js";

// Hashes directly via bcrypt rather than importing lib/password.ts (created
// in Task 3) — this file is created in Task 1, before that module exists,
// and fixture password hashes don't need to go through the app's configured
// salt-round setting.
const FIXTURE_SALT_ROUNDS = 4;

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now()}${counter}`;
}

export async function createProgram(
  overrides: Partial<{ code: string; name: string; duration_semesters: number }> = {}
) {
  const code = (overrides.code ?? unique("PRG")).toUpperCase().slice(0, 20);
  const { rows } = await pool.query(
    `INSERT INTO programs (code, name, duration_semesters) VALUES ($1, $2, $3) RETURNING *`,
    [code, overrides.name ?? "Test Program", overrides.duration_semesters ?? 8]
  );
  return rows[0];
}

export async function createBranch(
  programId: string,
  overrides: Partial<{ code: string; name: string }> = {}
) {
  const code = (overrides.code ?? unique("BR")).toUpperCase().slice(0, 20);
  const { rows } = await pool.query(
    `INSERT INTO branches (program_id, code, name) VALUES ($1, $2, $3) RETURNING *`,
    [programId, code, overrides.name ?? "Test Branch"]
  );
  return rows[0];
}

export async function createSubject(
  branchId: string,
  overrides: Partial<{ code: string; name: string; semester: number }> = {}
) {
  const code = (overrides.code ?? unique("SUB")).toUpperCase().slice(0, 20);
  const { rows } = await pool.query(
    `INSERT INTO subjects (branch_id, code, name, semester) VALUES ($1, $2, $3, $4) RETURNING *`,
    [branchId, code, overrides.name ?? "Test Subject", overrides.semester ?? 1]
  );
  return rows[0];
}

export interface CreateUserOptions {
  role: UserRole;
  programId?: string | null;
  branchId?: string | null;
  password?: string;
  email?: string;
}

export async function createUserFixture(options: CreateUserOptions) {
  const email = options.email ?? `${unique("user")}@test.edu`;
  const password = options.password ?? "password123";
  const passwordHash = await bcrypt.hash(password, FIXTURE_SALT_ROUNDS);
  const { rows } = await pool.query(
    `INSERT INTO users (email, full_name, password_hash, role, program_id, branch_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [email, "Test User", passwordHash, options.role, options.programId ?? null, options.branchId ?? null]
  );
  return { user: rows[0], password };
}
```

- [ ] **Step 8: Verify the harness can reach the local sandbox**

Run: `cd "/media/aryan/New Volume/projects/revisex-v2/db" && make local-reset`
Expected: sandbox rebuilt, migrations applied, seed loaded (this is the existing `db/` tooling, unchanged).

Run: `cd backend && npx vitest run --reporter=verbose` (no test files yet — expect "no tests found", not a connection error)

- [ ] **Step 9: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/vitest.config.ts backend/.env.test.example backend/tests/setup.ts backend/tests/helpers/db.ts backend/tests/helpers/fixtures.ts backend/.gitignore
git commit -m "test: add vitest + supertest infra and shared fixtures"
```

---

## Task 2: Shared response envelope, error handling, and pagination

**Files:**
- Create: `backend/src/lib/apiError.ts`
- Create: `backend/src/lib/response.ts`
- Create: `backend/src/lib/pagination.ts`
- Modify: `backend/src/middleware/errorHandler.ts`
- Modify: `backend/src/middleware/notFound.ts`
- Modify: `backend/src/modules/programs/programs.service.ts`
- Modify: `backend/src/modules/programs/programs.controller.ts`
- Test: `backend/tests/lib/pagination.test.ts`
- Test: `backend/tests/modules/programs.test.ts`

**Interfaces:**
- Produces: `ApiError` class (`new ApiError(status, code, message)`) from `lib/apiError.ts`; `sendSuccess<T>(res, data, status?)` from `lib/response.ts`; `parsePagination(query): { page, limit, offset }` and `buildPaginationMeta(page, limit, total): { page, limit, total, totalPages }` from `lib/pagination.ts`. Every later controller task uses all four.
- Removes: `HttpError` (was exported from `middleware/errorHandler.ts`) — replaced by `ApiError`.

- [ ] **Step 1: Write the failing test for pagination helpers**

`backend/tests/lib/pagination.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildPaginationMeta, parsePagination } from "../../src/lib/pagination.js";

describe("parsePagination", () => {
  it("defaults to page 1, limit 20", () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it("computes offset from page and limit", () => {
    expect(parsePagination({ page: "3", limit: "10" })).toEqual({ page: 3, limit: 10, offset: 20 });
  });

  it("clamps limit to a maximum of 100", () => {
    expect(() => parsePagination({ limit: "1000" })).toThrow();
  });

  it("rejects page below 1", () => {
    expect(() => parsePagination({ page: "0" })).toThrow();
  });
});

describe("buildPaginationMeta", () => {
  it("computes totalPages, rounding up", () => {
    expect(buildPaginationMeta(1, 20, 45)).toEqual({ page: 1, limit: 20, total: 45, totalPages: 3 });
  });

  it("returns at least 1 page when total is 0", () => {
    expect(buildPaginationMeta(1, 20, 0)).toEqual({ page: 1, limit: 20, total: 0, totalPages: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/lib/pagination.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/pagination.js'`

- [ ] **Step 3: Implement `backend/src/lib/pagination.ts`**

```typescript
import { z } from "zod";

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function parsePagination(query: unknown): PaginationParams {
  const { page, limit } = paginationQuerySchema.parse(query);
  return { page, limit, offset: (page - 1) * limit };
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/lib/pagination.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Implement `backend/src/lib/apiError.ts`**

```typescript
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}
```

- [ ] **Step 6: Implement `backend/src/lib/response.ts`**

```typescript
import type { Response } from "express";

export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}
```

- [ ] **Step 7: Rewrite `backend/src/middleware/errorHandler.ts`**

```typescript
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { ApiError } from "../lib/apiError.js";

// Express identifies error-handling middleware by arity (4 params) — _req and
// _next must stay even though this function doesn't use them.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof ZodError) {
    const first = err.issues[0];
    res.status(422).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: first ? `${first.path.join(".")}: ${first.message}` : "Validation failed",
      },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: env.NODE_ENV === "development" && err instanceof Error ? err.message : "Internal server error",
    },
  });
}
```

- [ ] **Step 8: Rewrite `backend/src/middleware/notFound.ts`**

```typescript
import type { Request, Response } from "express";

export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` },
  });
}
```

- [ ] **Step 9: Update `backend/src/modules/programs/programs.service.ts`** to paginate

```typescript
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
  // COUNT(*) always returns exactly one row; ?? 0 satisfies noUncheckedIndexedAccess.
  return { rows, total: Number(countRows[0]?.count ?? 0) };
}

export async function getProgramById(id: string): Promise<Program | null> {
  const { rows } = await pool.query<Program>(
    `SELECT ${SELECT_COLUMNS} FROM programs WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}
```

- [ ] **Step 10: Update `backend/src/modules/programs/programs.controller.ts`**

```typescript
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError.js";
import { buildPaginationMeta, parsePagination } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import * as programsService from "./programs.service.js";

const idParamSchema = z.string().uuid();

export async function listPrograms(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const { rows, total } = await programsService.listActivePrograms(limit, offset);
    sendSuccess(res, { items: rows, pagination: buildPaginationMeta(page, limit, total) });
  } catch (err) {
    next(err);
  }
}

export async function getProgram(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedId = idParamSchema.safeParse(req.params.id);
    if (!parsedId.success) throw new ApiError(400, "VALIDATION_ERROR", "Program id must be a UUID");
    const id = parsedId.data;

    const data = await programsService.getProgramById(id);
    if (!data) throw new ApiError(404, "NOT_FOUND", `Program ${id} not found`);

    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 11: Write the integration test for the new envelope**

`backend/tests/modules/programs.test.ts`:

```typescript
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { pool } from "../../src/config/db.js";
import { truncateAll } from "../helpers/db.js";
import { createProgram } from "../helpers/fixtures.js";

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe("GET /api/programs", () => {
  it("returns the standard success envelope with pagination", async () => {
    await createProgram({ code: "BTECH" });
    await createProgram({ code: "MBA" });

    const res = await request(app).get("/api/programs");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
  });

  it("paginates with page and limit query params", async () => {
    await createProgram({ code: "A1" });
    await createProgram({ code: "A2" });
    await createProgram({ code: "A3" });

    const res = await request(app).get("/api/programs?page=2&limit=2");

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });
});

describe("GET /api/programs/:id", () => {
  it("returns 404 in the standard error envelope for a missing program", async () => {
    const res = await request(app).get("/api/programs/00000000-0000-0000-0000-000000000000");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: { code: "NOT_FOUND", message: expect.any(String) } });
  });

  it("returns 400 for a malformed id", async () => {
    const res = await request(app).get("/api/programs/not-a-uuid");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("unmatched route", () => {
  it("returns the standard error envelope", async () => {
    const res = await request(app).get("/api/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: { code: "NOT_FOUND", message: expect.any(String) } });
  });
});
```

- [ ] **Step 12: Run test to verify it fails, then passes**

Run: `cd backend && npx vitest run tests/modules/programs.test.ts`
Expected first: FAIL (old envelope shape / `HttpError` import errors if any remain).
After Steps 7–10 are in place: PASS (5 tests).

Run: `cd backend && npm run typecheck`
Expected: PASS — confirms no remaining `HttpError` references anywhere (it was only used in `programs.controller.ts`, now removed).

- [ ] **Step 13: Commit**

```bash
git add backend/src/lib backend/src/middleware/errorHandler.ts backend/src/middleware/notFound.ts backend/src/modules/programs backend/tests/lib backend/tests/modules/programs.test.ts
git commit -m "feat: standard response envelope, pagination, and ApiError across programs module"
```

---

## Task 3: Password hashing and JWT libraries

**Files:**
- Modify: `backend/src/config/env.ts`
- Create: `backend/src/lib/password.ts`
- Create: `backend/src/lib/jwt.ts`
- Test: `backend/tests/lib/password.test.ts`
- Test: `backend/tests/lib/jwt.test.ts`

**Interfaces:**
- Consumes: `env` from `config/env.ts` (extended with JWT/bcrypt/AWS fields).
- Produces: `hashPassword(plain): Promise<string>`, `verifyPassword(plain, hash): Promise<boolean>` from `lib/password.ts`. `JwtPayload { sub, role, program_id, branch_id }`, `TokenPair { accessToken, refreshToken }`, `signAccessToken`, `signRefreshToken`, `signTokenPair`, `verifyAccessToken`, `verifyRefreshToken` from `lib/jwt.ts` — Task 4 (auth), Task 5 (users), Task 6 (middleware), Task 8/9 (notes) all import these.

- [ ] **Step 1: Extend `backend/src/config/env.ts`**

```typescript
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  DATABASE_URL: z.string().url().refine((url) => !url.includes("<password>"), {
    message: "DATABASE_URL still has the <user>:<password> placeholder — see .env.example",
  }),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  AWS_REGION: z.string().min(1),
  AWS_S3_BUCKET: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
```

- [ ] **Step 2: Update `backend/.env.example`** to document the new required vars (append after the existing `DATABASE_URL` line)

```
# Auth — generate with `openssl rand -hex 32` (produces 64 hex chars, well
# over the 32-char minimum). Access and refresh MUST use different secrets.
JWT_ACCESS_SECRET=<32+ char random string>
JWT_REFRESH_SECRET=<32+ char random string>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

BCRYPT_SALT_ROUNDS=10

# S3 — bucket for note file attachments. Credentials come from the standard
# AWS SDK chain (env vars / instance profile / shared config), not from
# custom-named vars here.
AWS_REGION=<your-region>
AWS_S3_BUCKET=<your-bucket-name>
```

- [ ] **Step 3: Write the failing test for password hashing**

`backend/tests/lib/password.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/lib/password.js";

describe("password hashing", () => {
  it("produces a hash different from the plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toBe("correct horse battery staple");
    expect(hash.length).toBeGreaterThan(20);
  });

  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/lib/password.test.ts`
Expected: FAIL — module not found, and/or `env` throws because `JWT_ACCESS_SECRET` etc. are missing from `.env.test` if Step 1 of this task ran before Step 4 of Task 1. (They were added in Task 1's `.env.test.example` already, so this should only fail on the missing module.)

- [ ] **Step 5: Implement `backend/src/lib/password.ts`**

```typescript
import bcrypt from "bcrypt";
import { env } from "../config/env.js";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/lib/password.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Write the failing test for JWT**

`backend/tests/lib/jwt.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  signAccessToken,
  signRefreshToken,
  signTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
} from "../../src/lib/jwt.js";

const payload = { sub: "11111111-1111-1111-1111-111111111111", role: "student" as const, program_id: null, branch_id: "22222222-2222-2222-2222-222222222222" };

describe("jwt", () => {
  it("round-trips an access token", () => {
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.role).toBe(payload.role);
    expect(decoded.branch_id).toBe(payload.branch_id);
  });

  it("round-trips a refresh token", () => {
    const token = signRefreshToken(payload);
    const decoded = verifyRefreshToken(token);
    expect(decoded.sub).toBe(payload.sub);
  });

  it("rejects an access token verified as a refresh token (different secrets)", () => {
    const token = signAccessToken(payload);
    expect(() => verifyRefreshToken(token)).toThrow();
  });

  it("signTokenPair returns both tokens", () => {
    const pair = signTokenPair(payload);
    expect(typeof pair.accessToken).toBe("string");
    expect(typeof pair.refreshToken).toBe("string");
    expect(pair.accessToken).not.toBe(pair.refreshToken);
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/lib/jwt.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/jwt.js'`

- [ ] **Step 9: Implement `backend/src/lib/jwt.ts`**

```typescript
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";
import type { UserRole } from "../types/index.js";

export interface JwtPayload {
  sub: string;
  role: UserRole;
  program_id: string | null;
  branch_id: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function signAccessToken(payload: JwtPayload): string {
  // @types/jsonwebtoken types expiresIn as a branded StringValue (from the
  // `ms` package), not a plain string — env.JWT_ACCESS_TTL is a validated
  // zod string but TS can't narrow it to that brand, so cast the options
  // object. The value itself is still validated shape (non-empty string).
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL } as SignOptions);
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_TTL } as SignOptions);
}

export function signTokenPair(payload: JwtPayload): TokenPair {
  return { accessToken: signAccessToken(payload), refreshToken: signRefreshToken(payload) };
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/lib/jwt.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 11: Commit**

```bash
git add backend/src/config/env.ts backend/.env.example backend/src/lib/password.ts backend/src/lib/jwt.ts backend/tests/lib/password.test.ts backend/tests/lib/jwt.test.ts
git commit -m "feat: bcrypt password hashing and JWT sign/verify helpers"
```

---

## Task 4: RBAC middleware

**Files:**
- Create: `backend/src/middleware/auth.ts`
- Test: `backend/tests/middleware/auth.test.ts`

**Interfaces:**
- Consumes: `verifyAccessToken`, `JwtPayload` from `lib/jwt.ts` (Task 3); `ApiError` from `lib/apiError.ts` (Task 2).
- Produces: `AuthUser { id, role, programId, branchId }` (also augments `Express.Request.user?: AuthUser`); `requireAuth`, `optionalAuth`, `requireRole(...roles)`, `requireScope(resolveScope)` where `resolveScope: (req) => Promise<{ programId: string | null; branchId: string | null } | null>`. Every protected route in Tasks 5, 6, 8, 9 uses these.

- [ ] **Step 1: Write the failing test using a throwaway protected route**

`backend/tests/middleware/auth.test.ts`:

```typescript
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { signAccessToken } from "../../src/lib/jwt.js";
import { optionalAuth, requireAuth, requireRole, requireScope } from "../../src/middleware/auth.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";

function buildTestApp() {
  const app = express();
  app.use(express.json());

  app.get("/protected", requireAuth, (req, res) => {
    res.json({ userId: req.user!.id, role: req.user!.role });
  });

  app.get("/admin-only", requireAuth, requireRole("superuser", "program_admin"), (_req, res) => {
    res.json({ ok: true });
  });

  app.get(
    "/scoped/:branchId",
    requireAuth,
    requireScope(async (req) => ({ programId: null, branchId: req.params.branchId })),
    (_req, res) => {
      res.json({ ok: true });
    }
  );

  app.get("/public", optionalAuth, (req, res) => {
    res.json({ userId: req.user?.id ?? null });
  });

  app.use(errorHandler);
  return app;
}

const payload = {
  sub: "11111111-1111-1111-1111-111111111111",
  role: "student" as const,
  program_id: null,
  branch_id: "22222222-2222-2222-2222-222222222222",
};

describe("requireAuth", () => {
  it("rejects a missing Authorization header", async () => {
    const res = await request(buildTestApp()).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a malformed token", async () => {
    const res = await request(buildTestApp()).get("/protected").set("Authorization", "Bearer not-a-token");
    expect(res.status).toBe(401);
  });

  it("attaches req.user for a valid token", async () => {
    const token = signAccessToken(payload);
    const res = await request(buildTestApp()).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: payload.sub, role: payload.role });
  });
});

describe("requireRole", () => {
  it("rejects a role not in the allowed set", async () => {
    const token = signAccessToken(payload); // role: student
    const res = await request(buildTestApp()).get("/admin-only").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("allows a role in the allowed set", async () => {
    const token = signAccessToken({ ...payload, role: "superuser" });
    const res = await request(buildTestApp()).get("/admin-only").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe("requireScope", () => {
  it("allows when scope matches", async () => {
    const token = signAccessToken(payload);
    const res = await request(buildTestApp())
      .get(`/scoped/${payload.branch_id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("masks a scope mismatch as 404", async () => {
    const token = signAccessToken(payload);
    const res = await request(buildTestApp())
      .get("/scoped/33333333-3333-3333-3333-333333333333")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("superuser bypasses scope checks", async () => {
    const token = signAccessToken({ ...payload, role: "superuser" });
    const res = await request(buildTestApp())
      .get("/scoped/33333333-3333-3333-3333-333333333333")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe("optionalAuth", () => {
  it("proceeds unauthenticated with no header", async () => {
    const res = await request(buildTestApp()).get("/public");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: null });
  });

  it("attaches req.user when a valid token is present", async () => {
    const token = signAccessToken(payload);
    const res = await request(buildTestApp()).get("/public").set("Authorization", `Bearer ${token}`);
    expect(res.body).toEqual({ userId: payload.sub });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/middleware/auth.test.ts`
Expected: FAIL — `Cannot find module '../../src/middleware/auth.js'`

- [ ] **Step 3: Implement `backend/src/middleware/auth.ts`**

```typescript
import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/apiError.js";
import { verifyAccessToken } from "../lib/jwt.js";
import type { UserRole } from "../types/index.js";

export interface AuthUser {
  id: string;
  role: UserRole;
  programId: string | null;
  branchId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function fromHeader(req: Request): AuthUser | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length);
  const payload = verifyAccessToken(token);
  return { id: payload.sub, role: payload.role, programId: payload.program_id, branchId: payload.branch_id };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const user = fromHeader(req);
    if (!user) {
      next(new ApiError(401, "UNAUTHENTICATED", "Missing or malformed Authorization header"));
      return;
    }
    req.user = user;
    next();
  } catch {
    next(new ApiError(401, "UNAUTHENTICATED", "Invalid or expired access token"));
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const user = fromHeader(req);
    if (user) req.user = user;
  } catch {
    // Invalid/expired token on a route that also serves anonymous users:
    // proceed unauthenticated rather than failing the request.
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new ApiError(401, "UNAUTHENTICATED", "Authentication required"));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ApiError(403, "FORBIDDEN", "Your role is not permitted to perform this action"));
      return;
    }
    next();
  };
}

export interface ResourceScope {
  programId: string | null;
  branchId: string | null;
}

export function requireScope(resolveScope: (req: Request) => Promise<ResourceScope | null>) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      next(new ApiError(401, "UNAUTHENTICATED", "Authentication required"));
      return;
    }
    try {
      const scope = await resolveScope(req);
      if (!scope) {
        next(new ApiError(404, "NOT_FOUND", "Resource not found"));
        return;
      }

      const { role, programId, branchId } = req.user;
      const inScope =
        role === "superuser" ||
        (role === "program_admin" && scope.programId === programId) ||
        (role === "branch_admin" && scope.branchId === branchId) ||
        (role === "student" && scope.branchId === branchId);

      // A mismatched scope must not reveal that the resource exists, so it
      // gets the same 404 as a genuinely missing one.
      if (!inScope) {
        next(new ApiError(404, "NOT_FOUND", "Resource not found"));
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/middleware/auth.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/auth.ts backend/tests/middleware/auth.test.ts
git commit -m "feat: RBAC middleware (requireAuth, requireRole, requireScope, optionalAuth)"
```

---

## Task 5: Auth module (register, login, refresh, logout, me)

**Files:**
- Create: `backend/src/modules/auth/auth.service.ts`
- Create: `backend/src/modules/auth/auth.controller.ts`
- Create: `backend/src/modules/auth/auth.routes.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/modules/auth.test.ts`

**Interfaces:**
- Consumes: `hashPassword`, `verifyPassword` (Task 3); `signTokenPair`, `verifyRefreshToken`, `JwtPayload`, `TokenPair` (Task 3); `ApiError` (Task 2); `sendSuccess` (Task 2); `requireAuth` (Task 4).
- Produces: `authRouter` mounted at `/api/auth`; `getUserById(id): Promise<User | null>` from `auth.service.ts` (also reused by Task 6's `/api/auth/me`-equivalent pattern, though Task 6 has its own `users.service.getUserById`).

- [ ] **Step 1: Write the failing integration test**

`backend/tests/modules/auth.test.ts`:

```typescript
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { pool } from "../../src/config/db.js";
import { truncateAll } from "../helpers/db.js";
import { createBranch, createProgram, createUserFixture } from "../helpers/fixtures.js";

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe("POST /api/auth/register", () => {
  it("creates a student account and returns tokens", async () => {
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
    expect(res.body.data.user).not.toHaveProperty("password_hash");
    expect(typeof res.body.data.accessToken).toBe("string");
    expect(typeof res.body.data.refreshToken).toBe("string");
  });

  it("rejects a duplicate email with 409", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({ role: "student", branchId: branch.id, email: "dupe@test.edu" });

    const res = await request(app).post("/api/auth/register").send({
      email: "dupe@test.edu",
      password: "password123",
      full_name: "Another Student",
      branch_id: branch.id,
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects an invalid body with 422", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "not-an-email" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user } = await createUserFixture({
      role: "student",
      branchId: branch.id,
      email: "login@test.edu",
      password: "correctpassword",
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "login@test.edu",
      password: "correctpassword",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(user.id);
    expect(typeof res.body.data.accessToken).toBe("string");
  });

  it("rejects a wrong password with 401", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({ role: "student", branchId: branch.id, email: "wrong@test.edu", password: "rightpass" });

    const res = await request(app).post("/api/auth/login").send({ email: "wrong@test.edu", password: "wrongpass" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects an unknown email with 401 (not 404 — no account enumeration)", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "nobody@test.edu", password: "whatever" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/refresh and GET /api/auth/me", () => {
  it("refreshes into a new usable access token", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({ role: "student", branchId: branch.id, email: "refresh@test.edu", password: "password123" });

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "refresh@test.edu", password: "password123" });

    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: loginRes.body.data.refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(typeof refreshRes.body.data.accessToken).toBe("string");

    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${refreshRes.body.data.accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe("refresh@test.edu");
  });

  it("rejects a malformed refresh token", async () => {
    const res = await request(app).post("/api/auth/refresh").send({ refreshToken: "garbage" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("returns success with null data", async () => {
    const res = await request(app).post("/api/auth/logout").send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/modules/auth.test.ts`
Expected: FAIL — `/api/auth/*` returns the `usersRouter`/no-route 404 stub shape, and imports for the not-yet-created service/controller/routes files fail if referenced directly (this test only hits HTTP, so the failure is route-not-found / 404s instead of 201s).

- [ ] **Step 3: Implement `backend/src/modules/auth/auth.service.ts`**

```typescript
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
```

- [ ] **Step 4: Implement `backend/src/modules/auth/auth.controller.ts`**

```typescript
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError.js";
import { sendSuccess } from "../../lib/response.js";
import * as authService from "./auth.service.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  full_name: z.string().min(1).max(150),
  branch_id: z.string().uuid(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const input = registerSchema.parse(req.body);
    const { user, tokens } = await authService.registerStudent(input);
    sendSuccess(res, { user, ...tokens }, 201);
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const { user, tokens } = await authService.login(email, password);
    sendSuccess(res, { user, ...tokens });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const tokens = await authService.refresh(refreshToken);
    sendSuccess(res, tokens);
  } catch (err) {
    next(err);
  }
}

export async function logout(_req: Request, res: Response) {
  // Stateless refresh tokens cannot be revoked server-side — logout is a
  // client-side token discard. This endpoint exists for API completeness.
  sendSuccess(res, null);
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const user = await authService.getUserById(req.user.id);
    if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 5: Implement `backend/src/modules/auth/auth.routes.ts`**

```typescript
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { login, logout, me, refresh, register } from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);
```

- [ ] **Step 6: Mount the router in `backend/src/app.ts`**

Add the import alongside the others near the top:

```typescript
import { authRouter } from "./modules/auth/auth.routes.js";
```

Add the mount line before `app.use("/api/programs", programsRouter);`:

```typescript
  app.use("/api/auth", authRouter);
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/modules/auth.test.ts`
Expected: PASS (9 tests)

Run: `cd backend && npm run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/auth backend/src/app.ts backend/tests/modules/auth.test.ts
git commit -m "feat: auth module (register, login, refresh, logout, me)"
```

---

## Task 6: Users module completion

**Files:**
- Modify: `backend/src/modules/users/users.routes.ts` (replace stub)
- Create: `backend/src/modules/users/users.service.ts`
- Create: `backend/src/modules/users/users.controller.ts`
- Test: `backend/tests/modules/users.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requireRole`, `AuthUser` (Task 4); `ApiError`, `sendSuccess`, `parsePagination`, `buildPaginationMeta` (Task 2); `hashPassword` (Task 3).
- Produces: `usersRouter` mounted at `/api/users` (already wired in `app.ts` — no change needed there).

- [ ] **Step 1: Write the failing integration test**

`backend/tests/modules/users.test.ts`:

```typescript
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { signAccessToken } from "../../src/lib/jwt.js";
import { pool } from "../../src/config/db.js";
import { truncateAll } from "../helpers/db.js";
import { createBranch, createProgram, createUserFixture } from "../helpers/fixtures.js";

const app = createApp();

function authHeader(user: { id: string; role: string; program_id: string | null; branch_id: string | null }) {
  const token = signAccessToken({
    sub: user.id,
    role: user.role as never,
    program_id: user.program_id,
    branch_id: user.branch_id,
  });
  return `Bearer ${token}`;
}

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe("GET /api/users/me and PATCH /api/users/me", () => {
  it("returns and updates the caller's own profile", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user } = await createUserFixture({ role: "student", branchId: branch.id });

    const meRes = await request(app).get("/api/users/me").set("Authorization", authHeader(user));
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.id).toBe(user.id);

    const patchRes = await request(app)
      .patch("/api/users/me")
      .set("Authorization", authHeader(user))
      .send({ full_name: "Updated Name" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.full_name).toBe("Updated Name");
  });
});

describe("GET /api/users (roster)", () => {
  it("forbids a student from listing users", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user: student } = await createUserFixture({ role: "student", branchId: branch.id });

    const res = await request(app).get("/api/users").set("Authorization", authHeader(student));
    expect(res.status).toBe(403);
  });

  it("scopes a branch_admin's roster to their own branch", async () => {
    const program = await createProgram();
    const branchA = await createBranch(program.id, { code: "BA" });
    const branchB = await createBranch(program.id, { code: "BB" });
    const { user: admin } = await createUserFixture({ role: "branch_admin", branchId: branchA.id });
    await createUserFixture({ role: "student", branchId: branchA.id });
    await createUserFixture({ role: "student", branchId: branchB.id });

    const res = await request(app).get("/api/users").set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    // The admin's own row plus the one student in branchA — none from branchB.
    expect(res.body.data.items.every((u: { branch_id: string }) => u.branch_id === branchA.id)).toBe(true);
    expect(res.body.data.pagination.total).toBe(2);
  });

  it("superuser sees everyone", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user: superuser } = await createUserFixture({ role: "superuser" });
    await createUserFixture({ role: "student", branchId: branch.id });

    const res = await request(app).get("/api/users").set("Authorization", authHeader(superuser));

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(2);
  });
});

describe("POST /api/users (admin-created accounts)", () => {
  it("lets a branch_admin create a student in their own branch", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user: admin } = await createUserFixture({ role: "branch_admin", branchId: branch.id });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", authHeader(admin))
      .send({
        email: "newstudent@test.edu",
        password: "password123",
        full_name: "New Student",
        role: "student",
        branch_id: branch.id,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe("student");
  });

  it("forbids a branch_admin from creating a student in a different branch", async () => {
    const program = await createProgram();
    const branchA = await createBranch(program.id, { code: "BA" });
    const branchB = await createBranch(program.id, { code: "BB" });
    const { user: admin } = await createUserFixture({ role: "branch_admin", branchId: branchA.id });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", authHeader(admin))
      .send({
        email: "sneaky@test.edu",
        password: "password123",
        full_name: "Sneaky",
        role: "student",
        branch_id: branchB.id,
      });

    expect(res.status).toBe(403);
  });

  it("forbids a branch_admin from creating an equal-or-higher role", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user: admin } = await createUserFixture({ role: "branch_admin", branchId: branch.id });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", authHeader(admin))
      .send({
        email: "escalate@test.edu",
        password: "password123",
        full_name: "Escalate",
        role: "branch_admin",
        branch_id: branch.id,
      });

    expect(res.status).toBe(403);
  });

  it("lets a program_admin create a branch_admin for a branch inside their program", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user: admin } = await createUserFixture({ role: "program_admin", programId: program.id });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", authHeader(admin))
      .send({
        email: "newadmin@test.edu",
        password: "password123",
        full_name: "New Admin",
        role: "branch_admin",
        branch_id: branch.id,
      });

    expect(res.status).toBe(201);
  });
});

describe("DELETE /api/users/:id", () => {
  it("lets a superuser delete any user", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user: superuser } = await createUserFixture({ role: "superuser" });
    const { user: target } = await createUserFixture({ role: "student", branchId: branch.id });

    const res = await request(app).delete(`/api/users/${target.id}`).set("Authorization", authHeader(superuser));
    expect(res.status).toBe(200);

    const getRes = await request(app).get("/api/users/me").set("Authorization", authHeader(target));
    expect(getRes.status).toBe(401); // token still parses, but the account is gone on any DB-backed lookup
  });
});
```

Note on the last assertion: `GET /api/users/me` re-verifies the JWT but the code path calls `usersService.getUserById`, which returns `null` for a deleted user — the controller must map that to `404`, not `401`. Fix the assertion before running: change `expect(getRes.status).toBe(401)` to `expect(getRes.status).toBe(404)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/modules/users.test.ts`
Expected: FAIL — every request gets `501` from the current stub.

- [ ] **Step 3: Implement `backend/src/modules/users/users.service.ts`**

```typescript
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
  const { rows } = await pool.query<User>(
    `UPDATE users SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING ${USER_COLUMNS}`,
    params
  );
  return rows[0] ?? null;
}

export async function deleteUser(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function branchBelongsToProgram(branchId: string, programId: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT 1 FROM branches WHERE id = $1 AND program_id = $2`, [branchId, programId]);
  return rows.length > 0;
}
```

- [ ] **Step 4: Implement `backend/src/modules/users/users.controller.ts`**

```typescript
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError.js";
import { buildPaginationMeta, parsePagination } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import type { AuthUser } from "../../middleware/auth.js";
import type { User, UserRole } from "../../types/index.js";
import * as usersService from "./users.service.js";

const roleEnum = z.enum(["superuser", "program_admin", "branch_admin", "student"]);

const roleHierarchy: Record<UserRole, number> = {
  superuser: 4,
  program_admin: 3,
  branch_admin: 2,
  student: 1,
};

const idParamSchema = z.string().uuid();

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const user = await usersService.getUserById(req.user.id);
    if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

const updateMeSchema = z.object({ full_name: z.string().min(1).max(150) });

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const { full_name } = updateMeSchema.parse(req.body);
    const user = await usersService.updateOwnProfile(req.user.id, full_name);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

const listQuerySchema = z.object({
  role: roleEnum.optional(),
  branch_id: z.string().uuid().optional(),
});

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");

    const { role, branch_id } = listQuerySchema.parse(req.query);
    const { page, limit, offset } = parsePagination(req.query);

    const options: usersService.ListUsersOptions = { role, branchId: branch_id };
    if (req.user.role === "branch_admin") {
      options.branchScopeId = req.user.branchId!;
    } else if (req.user.role === "program_admin") {
      options.programScopeId = req.user.programId!;
    }

    const { rows, total } = await usersService.listUsers(options, limit, offset);
    sendSuccess(res, { items: rows, pagination: buildPaginationMeta(page, limit, total) });
  } catch (err) {
    next(err);
  }
}

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  full_name: z.string().min(1).max(150),
  role: roleEnum,
  program_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  enrollment_year: z.number().int().nullable().optional(),
});

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const input = createUserSchema.parse(req.body);

    if (roleHierarchy[input.role] >= roleHierarchy[req.user.role]) {
      throw new ApiError(403, "FORBIDDEN", "You cannot create a user with a role equal to or above your own");
    }

    if (req.user.role === "program_admin") {
      if (!input.branch_id) throw new ApiError(422, "VALIDATION_ERROR", "branch_id is required for this role");
      const belongs = await usersService.branchBelongsToProgram(input.branch_id, req.user.programId!);
      if (!belongs) throw new ApiError(403, "FORBIDDEN", "That branch is outside your program");
    } else if (req.user.role === "branch_admin") {
      if (input.role !== "student") throw new ApiError(403, "FORBIDDEN", "You may only create student accounts");
      if (input.branch_id !== req.user.branchId) {
        throw new ApiError(403, "FORBIDDEN", "You may only create students in your own branch");
      }
    } else if (req.user.role !== "superuser") {
      throw new ApiError(403, "FORBIDDEN", "Your role cannot create users");
    }

    const user = await usersService.createUser({
      email: input.email,
      password: input.password,
      full_name: input.full_name,
      role: input.role,
      program_id: input.program_id ?? null,
      branch_id: input.branch_id ?? null,
      enrollment_year: input.enrollment_year ?? null,
    });
    sendSuccess(res, user, 201);
  } catch (err) {
    next(err);
  }
}

async function assertManageable(actor: AuthUser, target: User): Promise<void> {
  if (actor.role === "superuser") return;
  if (actor.role === "program_admin") {
    const inScope =
      target.program_id === actor.programId ||
      (target.branch_id ? await usersService.branchBelongsToProgram(target.branch_id, actor.programId!) : false);
    if (!inScope) throw new ApiError(404, "NOT_FOUND", "User not found");
    return;
  }
  if (actor.role === "branch_admin") {
    if (target.branch_id !== actor.branchId) throw new ApiError(404, "NOT_FOUND", "User not found");
    return;
  }
  throw new ApiError(403, "FORBIDDEN", "Your role cannot manage users");
}

const updateUserSchema = z.object({
  full_name: z.string().min(1).max(150).optional(),
  role: roleEnum.optional(),
  program_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  enrollment_year: z.number().int().nullable().optional(),
});

export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const idResult = idParamSchema.safeParse(req.params.id);
    if (!idResult.success) throw new ApiError(400, "VALIDATION_ERROR", "User id must be a UUID");

    const target = await usersService.getUserById(idResult.data);
    if (!target) throw new ApiError(404, "NOT_FOUND", "User not found");
    await assertManageable(req.user, target);

    const input = updateUserSchema.parse(req.body);
    if (input.role && roleHierarchy[input.role] >= roleHierarchy[req.user.role]) {
      throw new ApiError(403, "FORBIDDEN", "You cannot assign a role equal to or above your own");
    }

    const updated = await usersService.updateUser(idResult.data, input);
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const idResult = idParamSchema.safeParse(req.params.id);
    if (!idResult.success) throw new ApiError(400, "VALIDATION_ERROR", "User id must be a UUID");

    const target = await usersService.getUserById(idResult.data);
    if (!target) throw new ApiError(404, "NOT_FOUND", "User not found");
    await assertManageable(req.user, target);

    await usersService.deleteUser(idResult.data);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 5: Implement `backend/src/modules/users/users.routes.ts`** (replace the stub entirely)

```typescript
import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as controller from "./users.controller.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get("/me", controller.getMe);
usersRouter.patch("/me", controller.updateMe);

usersRouter.get("/", requireRole("superuser", "program_admin", "branch_admin"), controller.listUsers);
usersRouter.post("/", requireRole("superuser", "program_admin", "branch_admin"), controller.createUser);
usersRouter.patch("/:id", requireRole("superuser", "program_admin", "branch_admin"), controller.updateUser);
usersRouter.delete("/:id", requireRole("superuser", "program_admin", "branch_admin"), controller.deleteUser);
```

- [ ] **Step 6: Fix the test assertion noted in Step 1, then run to verify it passes**

Run: `cd backend && npx vitest run tests/modules/users.test.ts`
Expected: PASS (9 tests)

Run: `cd backend && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/users backend/tests/modules/users.test.ts
git commit -m "feat: users module (self-service profile, scoped admin roster and management)"
```

---

## Task 7: S3 presigned URL library

**Files:**
- Create: `backend/src/lib/s3.ts`
- Test: `backend/tests/lib/s3.test.ts`

**Interfaces:**
- Produces: `buildNoteFileKey(noteId, originalFilename): string`, `getPresignedPutUrl(key, mimeType, expiresInSeconds?): Promise<string>`, `getPresignedGetUrl(key, expiresInSeconds?): Promise<string>` — Task 9 (notes files) uses all three.

- [ ] **Step 1: Add the S3 mocking dev dependency**

Add to `backend/package.json`'s `devDependencies`: `"aws-sdk-client-mock": "^4.1.0"`.

Run: `cd backend && npm install`

- [ ] **Step 2: Write the failing test**

`backend/tests/lib/s3.test.ts`:

```typescript
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { buildNoteFileKey, getPresignedGetUrl, getPresignedPutUrl, s3Client } from "../../src/lib/s3.js";

const s3Mock = mockClient(s3Client);

beforeEach(() => {
  s3Mock.reset();
});

describe("buildNoteFileKey", () => {
  it("namespaces the key under the note id and sanitizes the filename", () => {
    const key = buildNoteFileKey("11111111-1111-1111-1111-111111111111", "my notes (final)!.pdf");
    expect(key.startsWith("notes/11111111-1111-1111-1111-111111111111/")).toBe(true);
    expect(key).not.toMatch(/[()! ]/);
    expect(key.endsWith(".pdf")).toBe(true);
  });

  it("produces a different key each call for the same filename", () => {
    const a = buildNoteFileKey("note-1", "same.pdf");
    const b = buildNoteFileKey("note-1", "same.pdf");
    expect(a).not.toBe(b);
  });
});

describe("presigned URLs", () => {
  it("returns a signed PUT URL", async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const url = await getPresignedPutUrl("notes/x/y.pdf", "application/pdf");
    expect(url).toContain("http");
  });

  it("returns a signed GET URL", async () => {
    s3Mock.on(GetObjectCommand).resolves({});
    const url = await getPresignedGetUrl("notes/x/y.pdf");
    expect(url).toContain("http");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/lib/s3.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/s3.js'`

- [ ] **Step 4: Implement `backend/src/lib/s3.ts`**

```typescript
import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";

export const s3Client = new S3Client({ region: env.AWS_REGION });

export function buildNoteFileKey(noteId: string, originalFilename: string): string {
  const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `notes/${noteId}/${randomUUID()}-${safeName}`;
}

export async function getPresignedPutUrl(key: string, mimeType: string, expiresInSeconds = 900): Promise<string> {
  const command = new PutObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: key, ContentType: mimeType });
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

export async function getPresignedGetUrl(key: string, expiresInSeconds = 300): Promise<string> {
  const command = new GetObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/lib/s3.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/lib/s3.ts backend/tests/lib/s3.test.ts
git commit -m "feat: S3 presigned PUT/GET URL helpers"
```

---

## Task 8: Notes module — core CRUD and listing

**Files:**
- Create: `backend/src/modules/notes/notes.service.ts`
- Create: `backend/src/modules/notes/notes.controller.ts`
- Modify: `backend/src/modules/notes/notes.routes.ts` (replace stub — files/review endpoints added in Task 9)
- Test: `backend/tests/modules/notes.test.ts`

**Interfaces:**
- Consumes: `ApiError`, `sendSuccess`, `parsePagination`, `buildPaginationMeta` (Task 2); `requireAuth`, `optionalAuth`, `AuthUser` (Task 4).
- Produces: from `notes.service.ts` — `createNote(uploaderId, input): Promise<Note>`, `listNotes(options, limit, offset): Promise<{rows, total}>`, `getNoteById(id): Promise<Note | null>`, `getNoteScope(id): Promise<{programId, branchId} | null>`, `updateNote(id, input): Promise<Note | null>`, `deleteNote(id): Promise<boolean>`. Task 9 adds file/review functions to this same service file and imports `getNoteScope` for `requireScope`.

- [ ] **Step 1: Write the failing integration test**

`backend/tests/modules/notes.test.ts`:

```typescript
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { signAccessToken } from "../../src/lib/jwt.js";
import { pool } from "../../src/config/db.js";
import { truncateAll } from "../helpers/db.js";
import { createBranch, createProgram, createSubject, createUserFixture } from "../helpers/fixtures.js";

const app = createApp();

function authHeader(user: { id: string; role: string; program_id: string | null; branch_id: string | null }) {
  const token = signAccessToken({
    sub: user.id,
    role: user.role as never,
    program_id: user.program_id,
    branch_id: user.branch_id,
  });
  return `Bearer ${token}`;
}

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

async function setup() {
  const program = await createProgram();
  const branch = await createBranch(program.id);
  const subject = await createSubject(branch.id);
  const { user: student } = await createUserFixture({ role: "student", branchId: branch.id });
  const { user: branchAdmin } = await createUserFixture({ role: "branch_admin", branchId: branch.id });
  return { program, branch, subject, student, branchAdmin };
}

describe("POST /api/notes", () => {
  it("creates a pending note for the authenticated uploader", async () => {
    const { subject, student } = await setup();

    const res = await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader(student))
      .send({ subject_id: subject.id, title: "Unit 1 Notes", note_type: "lecture_notes" });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("pending");
    expect(res.body.data.uploader_id).toBe(student.id);
  });

  it("rejects an unauthenticated request", async () => {
    const { subject } = await setup();
    const res = await request(app).post("/api/notes").send({ subject_id: subject.id, title: "X" });
    expect(res.status).toBe(401);
  });

  it("rejects a subject_id that doesn't exist", async () => {
    const { student } = await setup();
    const res = await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader(student))
      .send({ subject_id: "11111111-1111-1111-1111-111111111111", title: "X" });
    expect(res.status).toBe(422);
  });
});

describe("GET /api/notes visibility", () => {
  it("hides pending notes from an anonymous request", async () => {
    const { subject, student } = await setup();
    await pool.query(
      `INSERT INTO notes (subject_id, uploader_id, title, status) VALUES ($1, $2, 'Pending Note', 'pending')`,
      [subject.id, student.id]
    );

    const res = await request(app).get("/api/notes");
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });

  it("shows approved notes to anonymous requests", async () => {
    const { subject, student } = await setup();
    await pool.query(
      `INSERT INTO notes (subject_id, uploader_id, title, status, reviewed_at) VALUES ($1, $2, 'Approved Note', 'approved', now())`,
      [subject.id, student.id]
    );

    const res = await request(app).get("/api/notes");
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].title).toBe("Approved Note");
  });

  it("lets the uploader see their own pending note via status filter", async () => {
    const { subject, student } = await setup();
    await pool.query(
      `INSERT INTO notes (subject_id, uploader_id, title, status) VALUES ($1, $2, 'Mine', 'pending')`,
      [subject.id, student.id]
    );

    const res = await request(app).get("/api/notes?status=pending").set("Authorization", authHeader(student));
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
  });

  it("does not let a different student see someone else's pending note", async () => {
    const { subject, student, branch } = await setup();
    await pool.query(
      `INSERT INTO notes (subject_id, uploader_id, title, status) VALUES ($1, $2, 'Not Mine', 'pending')`,
      [subject.id, student.id]
    );
    const { user: otherStudent } = await createUserFixture({ role: "student", branchId: branch.id });

    const res = await request(app).get("/api/notes?status=pending").set("Authorization", authHeader(otherStudent));
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });

  it("lets an in-scope branch_admin see pending notes in their branch", async () => {
    const { subject, student, branchAdmin } = await setup();
    await pool.query(
      `INSERT INTO notes (subject_id, uploader_id, title, status) VALUES ($1, $2, 'Needs Review', 'pending')`,
      [subject.id, student.id]
    );

    const res = await request(app).get("/api/notes?status=pending").set("Authorization", authHeader(branchAdmin));
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
  });
});

describe("PATCH /api/notes/:id and DELETE /api/notes/:id", () => {
  it("lets the owner edit their own pending note", async () => {
    const { subject, student } = await setup();
    const { rows } = await pool.query(
      `INSERT INTO notes (subject_id, uploader_id, title, status) VALUES ($1, $2, 'Draft', 'pending') RETURNING id`,
      [subject.id, student.id]
    );

    const res = await request(app)
      .patch(`/api/notes/${rows[0].id}`)
      .set("Authorization", authHeader(student))
      .send({ title: "Updated Title" });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Updated Title");
  });

  it("forbids the owner from editing an already-approved note", async () => {
    const { subject, student } = await setup();
    const { rows } = await pool.query(
      `INSERT INTO notes (subject_id, uploader_id, title, status, reviewed_at) VALUES ($1, $2, 'Done', 'approved', now()) RETURNING id`,
      [subject.id, student.id]
    );

    const res = await request(app)
      .patch(`/api/notes/${rows[0].id}`)
      .set("Authorization", authHeader(student))
      .send({ title: "Try to change" });

    expect(res.status).toBe(403);
  });

  it("forbids a different student from deleting someone else's note", async () => {
    const { subject, student, branch } = await setup();
    const { rows } = await pool.query(
      `INSERT INTO notes (subject_id, uploader_id, title, status) VALUES ($1, $2, 'Mine', 'pending') RETURNING id`,
      [subject.id, student.id]
    );
    const { user: otherStudent } = await createUserFixture({ role: "student", branchId: branch.id });

    const res = await request(app).delete(`/api/notes/${rows[0].id}`).set("Authorization", authHeader(otherStudent));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/modules/notes.test.ts`
Expected: FAIL — every request hits the `501` stub.

- [ ] **Step 3: Implement `backend/src/modules/notes/notes.service.ts`** (core CRUD + listing only — file/review functions are added in Task 9, appended to this same file)

```typescript
import { pool } from "../../config/db.js";
import { ApiError } from "../../lib/apiError.js";
import type { AuthUser } from "../../middleware/auth.js";
import type { Note, NoteType, NoteStatus } from "../../types/index.js";

const NOTE_COLUMNS = `id, subject_id, uploader_id, title, description, note_type, exam_year,
  status, reviewed_by, reviewed_at, rejection_reason, download_count, created_at, updated_at`;
const NOTE_COLUMNS_ALIASED = NOTE_COLUMNS.split(",")
  .map((c) => `n.${c.trim()}`)
  .join(", ");

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23503";
}

export interface CreateNoteInput {
  subject_id: string;
  title: string;
  description: string | null;
  note_type: NoteType;
  exam_year: number | null;
}

export async function createNote(uploaderId: string, input: CreateNoteInput): Promise<Note> {
  try {
    const { rows } = await pool.query<Note>(
      `INSERT INTO notes (subject_id, uploader_id, title, description, note_type, exam_year)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${NOTE_COLUMNS}`,
      [input.subject_id, uploaderId, input.title, input.description, input.note_type, input.exam_year]
    );
    // INSERT ... RETURNING always returns exactly one row on success.
    return rows[0]!;
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw new ApiError(422, "VALIDATION_ERROR", "subject_id does not reference an existing subject");
    }
    throw err;
  }
}

export interface NoteFilters {
  subject_id?: string;
  note_type?: NoteType;
  status?: NoteStatus;
  q?: string;
}

export interface ListNotesOptions {
  filters: NoteFilters;
  viewer: AuthUser;
}

export async function listNotes(
  options: ListNotesOptions,
  limit: number,
  offset: number
): Promise<{ rows: Note[]; total: number }> {
  const { filters, viewer } = options;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let joinBranches = false;

  const status = filters.status ?? "approved";
  params.push(status);
  conditions.push(`n.status = $${params.length}`);

  if (status !== "approved") {
    if (viewer.role === "superuser") {
      // no extra restriction — superuser sees every status everywhere
    } else if (viewer.role === "program_admin") {
      joinBranches = true;
      params.push(viewer.programId);
      conditions.push(`b.program_id = $${params.length}`);
    } else if (viewer.role === "branch_admin") {
      joinBranches = true;
      params.push(viewer.branchId);
      conditions.push(`b.id = $${params.length}`);
    } else {
      params.push(viewer.id);
      conditions.push(`n.uploader_id = $${params.length}`);
    }
  }

  if (filters.subject_id) {
    params.push(filters.subject_id);
    conditions.push(`n.subject_id = $${params.length}`);
  }
  if (filters.note_type) {
    params.push(filters.note_type);
    conditions.push(`n.note_type = $${params.length}`);
  }
  if (filters.q) {
    params.push(filters.q);
    conditions.push(`n.search_vector @@ plainto_tsquery('english', $${params.length})`);
  }

  const joinClause = joinBranches
    ? `JOIN subjects s ON s.id = n.subject_id JOIN branches b ON b.id = s.branch_id`
    : "";
  const where = `WHERE ${conditions.join(" AND ")}`;

  const { rows } = await pool.query<Note>(
    `SELECT ${NOTE_COLUMNS_ALIASED} FROM notes n ${joinClause} ${where}
     ORDER BY n.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM notes n ${joinClause} ${where}`,
    params
  );
  // COUNT(*) always returns exactly one row; ?? 0 satisfies noUncheckedIndexedAccess.
  return { rows, total: Number(countRows[0]?.count ?? 0) };
}

export async function getNoteById(id: string): Promise<Note | null> {
  const { rows } = await pool.query<Note>(`SELECT ${NOTE_COLUMNS} FROM notes WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getNoteScope(id: string): Promise<{ programId: string; branchId: string } | null> {
  const { rows } = await pool.query<{ program_id: string; branch_id: string }>(
    `SELECT program_id, branch_id FROM v_note_scope WHERE note_id = $1`,
    [id]
  );
  const row = rows[0];
  return row ? { programId: row.program_id, branchId: row.branch_id } : null;
}

export interface UpdateNoteInput {
  title?: string;
  description?: string | null;
  note_type?: NoteType;
  exam_year?: number | null;
}

export async function updateNote(id: string, input: UpdateNoteInput): Promise<Note | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  if (sets.length === 0) return getNoteById(id);
  params.push(id);
  const { rows } = await pool.query<Note>(
    `UPDATE notes SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING ${NOTE_COLUMNS}`,
    params
  );
  return rows[0] ?? null;
}

export async function deleteNote(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM notes WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
```

- [ ] **Step 4: Implement `backend/src/modules/notes/notes.controller.ts`** (core handlers — `requestFiles`, `completeFile`, `downloadFile`, `reviewNote` are added in Task 9, appended to this same file)

```typescript
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError.js";
import { buildPaginationMeta, parsePagination } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import type { AuthUser } from "../../middleware/auth.js";
import * as notesService from "./notes.service.js";

const noteTypeEnum = z.enum(["lecture_notes", "pyq", "lab_manual", "assignment", "book", "other"]);
const noteStatusEnum = z.enum(["pending", "approved", "rejected"]);
const idParamSchema = z.string().uuid();

const anonymousViewer: AuthUser = { id: "", role: "student", programId: null, branchId: null };

export function isPrivilegedRole(role: string): boolean {
  return role === "superuser" || role === "program_admin" || role === "branch_admin";
}

async function loadNoteOr404(id: string) {
  const parsed = idParamSchema.safeParse(id);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Note id must be a UUID");
  const note = await notesService.getNoteById(parsed.data);
  if (!note) throw new ApiError(404, "NOT_FOUND", "Note not found");
  return note;
}

const createNoteSchema = z.object({
  subject_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  note_type: noteTypeEnum.default("other"),
  exam_year: z.number().int().min(1950).max(2200).nullable().optional(),
});

export async function createNote(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const input = createNoteSchema.parse(req.body);
    const note = await notesService.createNote(req.user.id, {
      subject_id: input.subject_id,
      title: input.title,
      description: input.description ?? null,
      note_type: input.note_type,
      exam_year: input.exam_year ?? null,
    });
    sendSuccess(res, note, 201);
  } catch (err) {
    next(err);
  }
}

const listQuerySchema = z.object({
  subject_id: z.string().uuid().optional(),
  note_type: noteTypeEnum.optional(),
  status: noteStatusEnum.optional(),
  q: z.string().min(1).max(200).optional(),
});

export async function listNotes(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listQuerySchema.parse(req.query);
    const { page, limit, offset } = parsePagination(req.query);

    const status = query.status && !req.user ? "approved" : query.status;
    const viewer = req.user ?? anonymousViewer;

    const { rows, total } = await notesService.listNotes({ filters: { ...query, status }, viewer }, limit, offset);
    sendSuccess(res, { items: rows, pagination: buildPaginationMeta(page, limit, total) });
  } catch (err) {
    next(err);
  }
}

export async function getNote(req: Request, res: Response, next: NextFunction) {
  try {
    const note = await loadNoteOr404(req.params.id);

    if (note.status !== "approved") {
      const isOwner = req.user?.id === note.uploader_id;
      const isPrivileged = !!req.user && isPrivilegedRole(req.user.role);
      if (!isOwner && !isPrivileged) throw new ApiError(404, "NOT_FOUND", "Note not found");
    }

    sendSuccess(res, note);
  } catch (err) {
    next(err);
  }
}

const updateNoteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  note_type: noteTypeEnum.optional(),
  exam_year: z.number().int().min(1950).max(2200).nullable().optional(),
});

export async function updateNote(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const note = await loadNoteOr404(req.params.id);

    const isOwner = note.uploader_id === req.user.id;
    if (!isOwner && !isPrivilegedRole(req.user.role)) {
      throw new ApiError(403, "FORBIDDEN", "You may not edit this note");
    }
    if (isOwner && !isPrivilegedRole(req.user.role) && note.status !== "pending") {
      throw new ApiError(403, "FORBIDDEN", "This note has already been reviewed and can no longer be edited");
    }

    const input = updateNoteSchema.parse(req.body);
    const updated = await notesService.updateNote(note.id, input);
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteNote(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const note = await loadNoteOr404(req.params.id);

    const isOwner = note.uploader_id === req.user.id;
    if (!isOwner && !isPrivilegedRole(req.user.role)) {
      throw new ApiError(403, "FORBIDDEN", "You may not delete this note");
    }

    await notesService.deleteNote(note.id);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}

export { loadNoteOr404 };
```

- [ ] **Step 5: Implement `backend/src/modules/notes/notes.routes.ts`** (core routes only — Task 9 adds file/review routes to this same file)

```typescript
import { Router } from "express";
import { optionalAuth, requireAuth } from "../../middleware/auth.js";
import * as controller from "./notes.controller.js";

export const notesRouter = Router();

notesRouter.get("/", optionalAuth, controller.listNotes);
notesRouter.get("/:id", optionalAuth, controller.getNote);

notesRouter.post("/", requireAuth, controller.createNote);
notesRouter.patch("/:id", requireAuth, controller.updateNote);
notesRouter.delete("/:id", requireAuth, controller.deleteNote);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/modules/notes.test.ts`
Expected: PASS (11 tests)

Run: `cd backend && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/notes/notes.service.ts backend/src/modules/notes/notes.controller.ts backend/src/modules/notes/notes.routes.ts backend/tests/modules/notes.test.ts
git commit -m "feat: notes module core CRUD and status/scope-aware listing"
```

---

## Task 9: Notes module — files, review, and download

**Files:**
- Modify: `backend/src/modules/notes/notes.service.ts` (append file/review functions)
- Modify: `backend/src/modules/notes/notes.controller.ts` (append file/review handlers)
- Modify: `backend/src/modules/notes/notes.routes.ts` (append file/review routes)
- Test: `backend/tests/modules/notes-files.test.ts`

**Interfaces:**
- Consumes: `buildNoteFileKey`, `getPresignedPutUrl`, `getPresignedGetUrl` (Task 7); `getNoteScope`, `loadNoteOr404`, `isPrivilegedRole` (Task 8); `requireScope`, `requireRole` (Task 4).

- [ ] **Step 1: Write the failing integration test**

`backend/tests/modules/notes-files.test.ts`:

```typescript
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { s3Client } from "../../src/lib/s3.js";
import { signAccessToken } from "../../src/lib/jwt.js";
import { pool } from "../../src/config/db.js";
import { truncateAll } from "../helpers/db.js";
import { createBranch, createProgram, createSubject, createUserFixture } from "../helpers/fixtures.js";

const app = createApp();
const s3Mock = mockClient(s3Client);

function authHeader(user: { id: string; role: string; program_id: string | null; branch_id: string | null }) {
  const token = signAccessToken({
    sub: user.id,
    role: user.role as never,
    program_id: user.program_id,
    branch_id: user.branch_id,
  });
  return `Bearer ${token}`;
}

beforeEach(async () => {
  await truncateAll();
  s3Mock.reset();
  s3Mock.on(PutObjectCommand).resolves({});
  s3Mock.on(GetObjectCommand).resolves({});
});

afterAll(async () => {
  await pool.end();
});

async function setup() {
  const program = await createProgram();
  const branch = await createBranch(program.id);
  const subject = await createSubject(branch.id);
  const { user: student } = await createUserFixture({ role: "student", branchId: branch.id });
  const { user: branchAdmin } = await createUserFixture({ role: "branch_admin", branchId: branch.id });
  const { user: otherBranchAdmin } = await createUserFixture({
    role: "branch_admin",
    branchId: (await createBranch(program.id, { code: "OTH" })).id,
  });
  return { program, branch, subject, student, branchAdmin, otherBranchAdmin };
}

async function createPendingNote(subjectId: string, uploaderId: string) {
  const { rows } = await pool.query(
    `INSERT INTO notes (subject_id, uploader_id, title, status) VALUES ($1, $2, 'Test Note', 'pending') RETURNING *`,
    [subjectId, uploaderId]
  );
  return rows[0];
}

describe("POST /api/notes/:id/files", () => {
  it("lets the owner request a presigned upload URL", async () => {
    const { subject, student } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const res = await request(app)
      .post(`/api/notes/${note.id}/files`)
      .set("Authorization", authHeader(student))
      .send({ files: [{ original_filename: "lecture1.pdf", mime_type: "application/pdf" }] });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].file.upload_status).toBe("pending");
    expect(typeof res.body.data[0].putUrl).toBe("string");
  });

  it("forbids a non-owner from requesting an upload URL", async () => {
    const { subject, student, branch } = await setup();
    const note = await createPendingNote(subject.id, student.id);
    const { user: otherStudent } = await createUserFixture({ role: "student", branchId: branch.id });

    const res = await request(app)
      .post(`/api/notes/${note.id}/files`)
      .set("Authorization", authHeader(otherStudent))
      .send({ files: [{ original_filename: "x.pdf", mime_type: "application/pdf" }] });

    expect(res.status).toBe(403);
  });
});

describe("POST /api/notes/:id/files/:fileId/complete", () => {
  it("marks the file uploaded", async () => {
    const { subject, student } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const requestRes = await request(app)
      .post(`/api/notes/${note.id}/files`)
      .set("Authorization", authHeader(student))
      .send({ files: [{ original_filename: "lecture1.pdf", mime_type: "application/pdf" }] });
    const fileId = requestRes.body.data[0].file.id;

    const completeRes = await request(app)
      .post(`/api/notes/${note.id}/files/${fileId}/complete`)
      .set("Authorization", authHeader(student))
      .send({ size_bytes: 12345 });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.upload_status).toBe("uploaded");
    expect(completeRes.body.data.size_bytes).toBe(12345);
  });
});

describe("POST /api/notes/:id/review", () => {
  it("lets an in-scope branch_admin approve a note", async () => {
    const { subject, student, branchAdmin } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const res = await request(app)
      .post(`/api/notes/${note.id}/review`)
      .set("Authorization", authHeader(branchAdmin))
      .send({ decision: "approved" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("approved");
    expect(res.body.data.reviewed_by).toBe(branchAdmin.id);
  });

  it("requires a rejection_reason when rejecting", async () => {
    const { subject, student, branchAdmin } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const res = await request(app)
      .post(`/api/notes/${note.id}/review`)
      .set("Authorization", authHeader(branchAdmin))
      .send({ decision: "rejected" });

    expect(res.status).toBe(422);
  });

  it("masks an out-of-scope branch_admin's review attempt as 404", async () => {
    const { subject, student, otherBranchAdmin } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const res = await request(app)
      .post(`/api/notes/${note.id}/review`)
      .set("Authorization", authHeader(otherBranchAdmin))
      .send({ decision: "approved" });

    expect(res.status).toBe(404);
  });

  it("forbids a student from reviewing", async () => {
    const { subject, student } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const res = await request(app)
      .post(`/api/notes/${note.id}/review`)
      .set("Authorization", authHeader(student))
      .send({ decision: "approved" });

    expect(res.status).toBe(403);
  });
});

describe("GET /api/notes/:id/files/:fileId/download", () => {
  it("returns a presigned URL and increments download_count for an approved note", async () => {
    const { subject, student } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const requestRes = await request(app)
      .post(`/api/notes/${note.id}/files`)
      .set("Authorization", authHeader(student))
      .send({ files: [{ original_filename: "lecture1.pdf", mime_type: "application/pdf" }] });
    const fileId = requestRes.body.data[0].file.id;

    await request(app)
      .post(`/api/notes/${note.id}/files/${fileId}/complete`)
      .set("Authorization", authHeader(student))
      .send({ size_bytes: 100 });

    await pool.query(`UPDATE notes SET status = 'approved', reviewed_at = now() WHERE id = $1`, [note.id]);

    const downloadRes = await request(app).get(`/api/notes/${note.id}/files/${fileId}/download`);

    expect(downloadRes.status).toBe(200);
    expect(typeof downloadRes.body.data.url).toBe("string");

    const { rows } = await pool.query(`SELECT download_count FROM notes WHERE id = $1`, [note.id]);
    expect(rows[0].download_count).toBe(1);
  });

  it("hides the download for a pending note from an anonymous request", async () => {
    const { subject, student } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const requestRes = await request(app)
      .post(`/api/notes/${note.id}/files`)
      .set("Authorization", authHeader(student))
      .send({ files: [{ original_filename: "lecture1.pdf", mime_type: "application/pdf" }] });
    const fileId = requestRes.body.data[0].file.id;

    const res = await request(app).get(`/api/notes/${note.id}/files/${fileId}/download`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/modules/notes-files.test.ts`
Expected: FAIL — `POST /:id/files` etc. don't exist yet (404 from the router, since only `/`, `/:id` GET/PATCH/DELETE exist from Task 8).

- [ ] **Step 3: Append to `backend/src/modules/notes/notes.service.ts`**

Add these imports at the top (alongside the existing ones):

```typescript
import { buildNoteFileKey, getPresignedGetUrl, getPresignedPutUrl } from "../../lib/s3.js";
import { env } from "../../config/env.js";
import type { NoteFile } from "../../types/index.js";
```

Append at the end of the file:

```typescript
const FILE_COLUMNS = `id, note_id, s3_bucket, s3_key, original_filename, mime_type, size_bytes,
  checksum_sha256, page_count, sort_order, upload_status, uploaded_at, created_at`;

export interface RequestFileInput {
  original_filename: string;
  mime_type: string;
}

export async function createPendingFiles(
  noteId: string,
  files: RequestFileInput[]
): Promise<Array<{ file: NoteFile; putUrl: string }>> {
  const results: Array<{ file: NoteFile; putUrl: string }> = [];
  for (const [index, f] of files.entries()) {
    const key = buildNoteFileKey(noteId, f.original_filename);
    const { rows } = await pool.query<NoteFile>(
      `INSERT INTO files (note_id, s3_bucket, s3_key, original_filename, mime_type, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${FILE_COLUMNS}`,
      [noteId, env.AWS_S3_BUCKET, key, f.original_filename, f.mime_type, index]
    );
    // INSERT ... RETURNING always returns exactly one row on success.
    const file = rows[0]!;
    const putUrl = await getPresignedPutUrl(key, f.mime_type);
    results.push({ file, putUrl });
  }
  return results;
}

export async function getFileById(fileId: string): Promise<NoteFile | null> {
  const { rows } = await pool.query<NoteFile>(`SELECT ${FILE_COLUMNS} FROM files WHERE id = $1`, [fileId]);
  return rows[0] ?? null;
}

export async function completeFileUpload(fileId: string, sizeBytes: number): Promise<NoteFile | null> {
  const { rows } = await pool.query<NoteFile>(
    `UPDATE files SET upload_status = 'uploaded', size_bytes = $1, uploaded_at = now()
     WHERE id = $2 RETURNING ${FILE_COLUMNS}`,
    [sizeBytes, fileId]
  );
  return rows[0] ?? null;
}

export async function getDownloadUrl(s3Key: string): Promise<string> {
  return getPresignedGetUrl(s3Key);
}

export async function incrementDownloadCount(noteId: string): Promise<void> {
  await pool.query(`UPDATE notes SET download_count = download_count + 1 WHERE id = $1`, [noteId]);
}

export async function reviewNote(
  id: string,
  reviewerId: string,
  decision: "approved" | "rejected",
  rejectionReason: string | null
): Promise<Note | null> {
  const { rows } = await pool.query<Note>(
    `UPDATE notes
     SET status = $1, reviewed_by = $2, reviewed_at = now(), rejection_reason = $3
     WHERE id = $4
     RETURNING ${NOTE_COLUMNS}`,
    [decision, reviewerId, decision === "rejected" ? rejectionReason : null, id]
  );
  return rows[0] ?? null;
}
```

- [ ] **Step 4: Append to `backend/src/modules/notes/notes.controller.ts`**

Add this import at the top:

```typescript
import type { NoteFile } from "../../types/index.js";
```

Append at the end of the file:

```typescript
const requestFilesSchema = z.object({
  files: z
    .array(
      z.object({
        original_filename: z.string().min(1).max(255),
        mime_type: z.string().min(1).max(120),
      })
    )
    .min(1)
    .max(10),
});

export async function requestFiles(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const note = await loadNoteOr404(req.params.id);

    if (note.uploader_id !== req.user.id) {
      throw new ApiError(403, "FORBIDDEN", "Only the uploader may add files to this note");
    }
    if (note.status !== "pending") {
      throw new ApiError(403, "FORBIDDEN", "Files can only be added while the note is pending review");
    }

    const { files } = requestFilesSchema.parse(req.body);
    const results = await notesService.createPendingFiles(note.id, files);
    sendSuccess(res, results, 201);
  } catch (err) {
    next(err);
  }
}

const completeFileSchema = z.object({ size_bytes: z.number().int().positive() });

export async function completeFile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const note = await loadNoteOr404(req.params.id);
    if (note.uploader_id !== req.user.id) {
      throw new ApiError(403, "FORBIDDEN", "Only the uploader may confirm uploads for this note");
    }

    const fileIdResult = idParamSchema.safeParse(req.params.fileId);
    if (!fileIdResult.success) throw new ApiError(400, "VALIDATION_ERROR", "File id must be a UUID");

    const file: NoteFile | null = await notesService.getFileById(fileIdResult.data);
    if (!file || file.note_id !== note.id) throw new ApiError(404, "NOT_FOUND", "File not found");

    const { size_bytes } = completeFileSchema.parse(req.body);
    const updated = await notesService.completeFileUpload(file.id, size_bytes);
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}

export async function downloadFile(req: Request, res: Response, next: NextFunction) {
  try {
    const note = await loadNoteOr404(req.params.id);

    if (note.status !== "approved") {
      const isOwner = req.user?.id === note.uploader_id;
      const isPrivileged = !!req.user && isPrivilegedRole(req.user.role);
      if (!isOwner && !isPrivileged) throw new ApiError(404, "NOT_FOUND", "Note not found");
    }

    const fileIdResult = idParamSchema.safeParse(req.params.fileId);
    if (!fileIdResult.success) throw new ApiError(400, "VALIDATION_ERROR", "File id must be a UUID");

    const file: NoteFile | null = await notesService.getFileById(fileIdResult.data);
    if (!file || file.note_id !== note.id || file.upload_status !== "uploaded") {
      throw new ApiError(404, "NOT_FOUND", "File not found");
    }

    const url = await notesService.getDownloadUrl(file.s3_key);
    await notesService.incrementDownloadCount(note.id);
    sendSuccess(res, { url });
  } catch (err) {
    next(err);
  }
}

const reviewSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    rejection_reason: z.string().min(1).max(1000).optional(),
  })
  .refine((data) => data.decision !== "rejected" || !!data.rejection_reason, {
    message: "rejection_reason is required when decision is 'rejected'",
    path: ["rejection_reason"],
  });

export async function reviewNote(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const note = await loadNoteOr404(req.params.id);
    const input = reviewSchema.parse(req.body);

    const updated = await notesService.reviewNote(note.id, req.user.id, input.decision, input.rejection_reason ?? null);
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 5: Append to `backend/src/modules/notes/notes.routes.ts`**

Add these imports at the top (alongside the existing ones):

```typescript
import { requireRole, requireScope } from "../../middleware/auth.js";
import * as notesService from "./notes.service.js";
```

Append at the end of the file (after the existing route declarations):

```typescript
notesRouter.get("/:id/files/:fileId/download", optionalAuth, controller.downloadFile);
notesRouter.post("/:id/files", requireAuth, controller.requestFiles);
notesRouter.post("/:id/files/:fileId/complete", requireAuth, controller.completeFile);

notesRouter.post(
  "/:id/review",
  requireAuth,
  requireRole("superuser", "program_admin", "branch_admin"),
  requireScope((req) => notesService.getNoteScope(req.params.id)),
  controller.reviewNote
);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/modules/notes-files.test.ts`
Expected: PASS (9 tests)

Run: `cd backend && npx vitest run` (full suite)
Expected: PASS, all files.

Run: `cd backend && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Update `backend/README.md`**

In the "What's deliberately not here yet" section, remove the bullets about Auth, request validation beyond `:id`, and the S3 upload flow (all now implemented). Replace with a short "Known limitations" note:

```markdown
## Known limitations

- **Refresh tokens are stateless** — logout is client-side only; a leaked
  refresh token remains valid until it expires. See
  `docs/superpowers/specs/2026-09-02-auth-rbac-notes-design.md`.
- **No stale-upload sweeper yet** — `files.upload_status = 'pending'` rows
  from abandoned uploads are not automatically cleaned up. The index
  (`idx_files_stale_uploads`) is in place for when this is added.
- Business logic for `tags`, `bookmarks`, `ratings`, `comments`, and full CRUD
  on `branches`/`subjects` is still out of scope — those remain `501` stubs.
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/notes backend/tests/modules/notes-files.test.ts backend/README.md
git commit -m "feat: notes file upload flow (presigned S3), moderation review, and downloads"
```

---

## Self-Review Notes

**Spec coverage:**
- Auth (register/login/refresh/logout/me) — Task 5. ✓
- RBAC middleware — Task 4. ✓
- Response envelope + pagination, applied to `programs` and every new module — Task 2 (programs), Tasks 5/6/8/9 (auth has no lists; users and notes are paginated). ✓
- Users module (self-service + scoped admin roster/management) — Task 6. ✓
- Notes module CRUD + moderation + S3 two-phase upload + download — Tasks 8–9. ✓
- No `/api/v1` prefix anywhere — confirmed in every route file above. ✓
- bcrypt, stateless JWT refresh — Task 3, Task 5. ✓
- No schema changes — confirmed; every query in every service targets existing columns/tables/views (`v_note_scope` included). ✓
- Existing stub modules (`branches`, `subjects`, `tags`, `bookmarks`, `ratings`, `comments`, top-level `files`) — untouched, remain `501`, automatically pick up the new `errorHandler`/`notFound` envelope since those are shared middleware. ✓

**Known accepted limitations, carried from the spec (not gaps in the plan):** stale pending-upload sweeping is not implemented; refresh-token revocation is not possible with the stateless design. Both are called out in Task 9 Step 7's README update.
