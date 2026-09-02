# Auth, RBAC, API conventions, and Notes module — design

Status: approved by user, ready for implementation planning.

## Context

The repo already has a designed, migrated, and verified PostgreSQL schema
(`db/`, golang-migrate, targeting Neon) and an Express + TypeScript backend
skeleton (`backend/`) with one fully-wired reference module (`programs`) and
stub (`501`) modules for everything else. No auth exists yet.

A broader spec was proposed for this platform (NestJS/FastAPI, Prisma/
SQLAlchemy, a 5-tier department/program/section/professor RBAC model,
`/api/v1` URL versioning). Decisions made with the user, in order:

1. **Keep the existing stack.** Express + TypeScript + raw `pg` + golang-migrate
   stays. No framework or ORM switch.
2. **Keep the existing domain model and RBAC exactly as-is.** No `departments`,
   no `sections`, no `professor` role, no schema restructuring. The hierarchy
   remains `programs → branches → subjects`, roles remain
   `superuser > program_admin > branch_admin > student`.
3. **Do apply the API conventions from the new spec**, adapted:
   - Standard response envelope: `{ success: true, data }` /
     `{ success: false, error: { code, message } }`.
   - Pagination + filtering on all list endpoints.
   - **No `/api/v1` URL versioning** — routes stay at `/api/<resource>`, not
     `/api/v1/<resource>`.
4. **Password hashing: bcrypt** (not argon2).
5. **Refresh tokens: stateless JWT**, returned in the response body (not an
   httpOnly cookie, not DB-backed). No server-side revocation list — logout is
   client-side token discard only. This is a documented limitation, not an
   oversight: accepted tradeoff for simplicity over revocability.

## Scope

In scope for this pass:
- Auth module (register, login, refresh, logout, me).
- RBAC middleware, reused across all protected routes.
- Shared response envelope + pagination helpers, applied to every module
  (including existing stubs, which stay `501` but move to the new envelope
  shape for their error responses).
- Finishing the `users` module (self-service profile, admin roster/management
  scoped to role).
- Fully wiring the `notes` module: CRUD, moderation workflow, S3 two-phase
  upload flow (already designed in `db/README.md`'s "S3 upload flow" section
  and `files.upload_status`), download URLs.

Out of scope (per "do not scaffold other feature modules yet"): `tags`,
`bookmarks`, `ratings`, `comments`, `branches`, `subjects` beyond what
`notes` needs read access to. These stay `501` stubs, untouched except that
the shared error-response shape now applies to them for free (they go through
the same `errorHandler`).

## Components

### 1. Auth (`src/modules/auth/`)

- `POST /api/auth/register` — student self-registration. Body: `email`,
  `password`, `full_name`, `branch_id`. Server sets `role = 'student'` always
  — the endpoint cannot be used to create any other role. Returns the same
  token pair as login.
- `POST /api/auth/login` — `email` + `password`. Verifies bcrypt hash via
  `users.password_hash`. Returns `{ accessToken, refreshToken, user }`.
- `POST /api/auth/refresh` — body: `refreshToken`. Verifies signature +
  expiry against a *separate* signing secret from the access token. Issues a
  fresh access+refresh pair (rotation in the sense of "new pair each call",
  not revocation of the old one — stateless, so the old refresh token remains
  valid until its own expiry if captured).
- `POST /api/auth/logout` — no-op server-side (stateless); documented as
  "client discards tokens." Exists for API completeness / future upgrade
  path, returns `200` with `data: null`.
- `GET /api/auth/me` — requires `requireAuth`, returns the caller's user row
  (minus `password_hash`).

JWT claims (both tokens): `sub` (user id), `role`, `program_id`, `branch_id`,
`iat`, `exp`. Access token TTL ~15m, refresh TTL ~7d, distinct env-configured
secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) and TTLs
(`JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`).

### 2. RBAC middleware (`src/middleware/auth.ts`)

- `requireAuth` — verifies the `Authorization: Bearer <token>` access JWT,
  attaches `req.user = { id, role, programId, branchId }`. `401` on
  missing/invalid/expired token.
- `requireRole(...roles: UserRole[])` — `403` if `req.user.role` is not in
  the allowed set. Used directly (explicit allow-lists per route), not an
  implicit hierarchy walk — keeps each route's authorization intent
  grep-able at the route declaration.
- `requireScope(resolveScope)` — takes a function that, given `req`, returns
  the target resource's `{ programId, branchId }` (e.g. by loading the note's
  subject → branch → program via `v_note_scope`). Superuser always passes;
  `program_admin` requires matching `programId`; `branch_admin` and `student`
  require matching `branchId`. `403` on mismatch, `404` if the resource
  doesn't exist (checked before the scope compare, so scope failures don't
  leak existence — actually: since a mismatched scope should not reveal
  whether the resource exists to an out-of-scope actor, `requireScope`
  returns `404` for both "not found" and "found but out of scope").

### 3. Response envelope + pagination (`src/lib/`)

- `ApiError` class: `constructor(status, code, message)`. Thrown from
  services/controllers, caught by `errorHandler`.
- `sendSuccess(res, data, status = 200)` → `res.status(status).json({ success: true, data })`.
- `errorHandler` rewritten to emit `{ success: false, error: { code, message } }`
  for both `ApiError` instances and unexpected errors (the latter as a generic
  `500 INTERNAL_ERROR`, logged server-side with full detail, never leaking
  internals to the client).
- Zod validation failures → `422` with `code: 'VALIDATION_ERROR'` and a
  `message` summarizing the first failing field (full issue list optional in
  `error.details`).
- `parsePagination(req.query)` → `{ page, limit, offset }`, clamped
  (`limit` max e.g. 100, default 20; `page` min 1). List responses shape as
  `data: { items: T[], pagination: { page, limit, total, totalPages } }`.

### 4. `notes` module completion

Routes (all under `/api/notes`, no version prefix):

- `POST /` — create note (`status = 'pending'`), `requireAuth`. Body:
  `subject_id`, `title`, `description?`, `note_type`, `exam_year?`.
- `GET /` — paginated + filterable (`subject_id`, `note_type`, `status`,
  `q` full-text via `search_vector`). Non-admins are forced to
  `status = 'approved'` regardless of query param; in-scope admins may pass
  `status` freely; superuser sees all.
- `GET /:id` — same visibility rule as list.
- `PATCH /:id` — owner (if still `pending`) or in-scope admin.
- `DELETE /:id` — owner or in-scope admin.
- `POST /:id/review` — `requireRole('superuser','program_admin','branch_admin')`
  + `requireScope`. Body: `{ decision: 'approved'|'rejected', rejection_reason? }`,
  enforced against `notes_review_consistency` CHECK (reason required iff
  rejected).
- `POST /:id/files` — request presigned PUT URL(s). Body: array of
  `{ original_filename, mime_type }`. Creates `files` rows
  (`upload_status = 'pending'`), returns presigned S3 PUT URLs + file ids.
  Owner only, note must still be editable (`pending`).
- `POST /:id/files/:fileId/complete` — client confirms S3 PUT succeeded.
  Body: `{ size_bytes }` (checksum optional). Sets `upload_status='uploaded'`,
  `uploaded_at`, `size_bytes`. Satisfies `files_upload_complete` CHECK.
- `GET /:id/files/:fileId/download` — presigned GET URL, visibility rule as
  note read; increments `notes.download_count` (matches "counter, not a log"
  design note in `db/README.md`).

S3 access via AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`),
config from env (`AWS_REGION`, `AWS_S3_BUCKET`, plus standard AWS credential
chain — no secrets hardcoded). A background sweep for stale `pending` files
(the `idx_files_stale_uploads` index already exists for this) is **out of
scope for this pass** — noted as a follow-up, not silently dropped.

### 5. `users` module completion

- `GET /api/users/me`, `PATCH /api/users/me` — self-service profile
  (full_name only; role/program/branch are not self-editable).
- `GET /api/users` — admin roster, paginated + filterable (`role`, `branch_id`,
  `program_id`), scoped: `branch_admin` sees only their branch,
  `program_admin` their program, superuser everyone.
- `POST /api/users` — admin-created accounts (e.g. a superuser creating a
  `program_admin`, a program_admin creating a `branch_admin`). Scope-checked:
  an actor may only create a role at or below what their own scope permits,
  and only within their own program/branch.
- `PATCH /api/users/:id`, `DELETE /api/users/:id` — same scope rule.

## Migrations

None required. Everything needed (`password_hash`, role/scope columns,
`files.upload_status`, etc.) already exists in `000001_initial_schema`. If
implementation surfaces a genuine gap, it becomes a new
`000002_<description>` migration — never an edit to `000001`.

## Config additions (`backend/.env`, `src/config/env.ts`)

`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`,
`BCRYPT_SALT_ROUNDS`, `AWS_REGION`, `AWS_S3_BUCKET` (+ standard AWS credential
env vars, not custom-named). All validated by the existing zod-based
`env.ts`, failing fast on boot if missing — same pattern already in place for
`DATABASE_URL`.

## Testing

- Unit tests per service (mocked `pool`/query layer) for business logic:
  scope checks, review-decision validation, pagination clamping.
- Integration tests (supertest against the Express app) per module, run
  against the local Docker Postgres sandbox already defined in `db/`:
  register → login → refresh flow; RBAC denial cases (wrong role, wrong
  scope) for notes review and user management; notes create → presign →
  complete → download flow; list pagination/filtering.
- Existing `db/tests.sql` (28 constraint tests) stays the schema-level
  contract; these new tests are API-level, not a replacement.

## Deviations / open items carried forward, not silently resolved

- Refresh-token revocation (logout, compromised-token invalidation) is not
  possible with the stateless design chosen. If that becomes a requirement,
  it's a follow-up migration (`refresh_tokens` table) — not implied by
  anything here.
- Stale pending-upload sweeping (`idx_files_stale_uploads`) has an index
  ready but no scheduled job yet; out of scope for this pass.
