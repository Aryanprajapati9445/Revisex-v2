# Backend — College Notes Management Platform

REST API in Node.js + TypeScript + Express, backed by the schema in
[`../db`](../db/README.md).

## Setup

```bash
# Once, and after any schema change in ../db/drizzle/schema/: build db/'s
# Drizzle schema so this package can import its compiled types.
(cd ../db && npm install && npm run build)

npm install
cp .env.example .env
# edit .env — DATABASE_URL should be Neon's POOLED connection string
# (hostname contains "-pooler"). The db/ layer uses the direct string for
# DDL; this is app runtime traffic, which is what PgBouncer pooling is for.
npm run dev
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Runs `src/server.ts` with `tsx watch` — restarts on file change. |
| `npm run typecheck` | `tsc --noEmit`. No build output, just verifies types. |
| `npm run build` | Compiles to `dist/`. |
| `npm start` | Runs the compiled `dist/server.js`. Run `build` first. |

## Verification status

Run and checked directly, not just written:

- `npm install` — clean, 0 vulnerabilities.
- `npm run typecheck` — passes.
- **Failure paths**, booted with an unreachable database:
  - `GET /health` → `200 {"status":"ok"}` — works with no database at all.
  - `GET /health/db` → `503 {"status":"unreachable"}`, confirming the
    readiness check actually queries rather than always reporting healthy.
  - `GET /api/programs` (the wired module) → `500` with the real Postgres
    error, via `errorHandler` — a query failure returns clean JSON, it does
    not crash the process.
  - `GET /api/tags`, `/api/bookmarks` (stubs) → `501` with a per-resource
    message. `GET /nonexistent` → `404`. `GET /health` again afterward →
    still `200` — the process survived every case above.
- **Happy path**, against `db/`'s local sandbox (`make local-reset`) seeded
  with real data:
  - `GET /health/db` → `200` — confirms connectivity, not just failure.
  - `GET /api/programs` → `200` with all 3 seeded programs (BTECH/MBA/MCA),
    correct fields.
  - `GET /api/programs/:id` with that id → `200` with the matching row; with
    a malformed id (`not-a-uuid`) → `400`, not `500`; with a well-formed but
    nonexistent UUID → `404`.
  - Caught by this run, not by `tsc` (both were unchecked `pool.query<T>()`
    assertions — the type was wrong, not the code that used it):
    `created_at` was coming back as a JS `Date` where `types/index.ts`
    declares `string`, and `files.size_bytes` (`BIGINT`) was coming back as
    a `string` where `NoteFile` declares `number`. Both were invisible
    through `JSON.stringify` — confirmed with `typeof`/`instanceof` against
    the raw query result, not the HTTP response. Fixed in `config/db.ts` via
    `pg`'s `types.setTypeParser`, and reconfirmed after the fix that
    `created_at` now serializes as real ISO 8601 (`...T...Z`), not
    Postgres's native `+00` text form.
- Not yet run against a real Neon database — that needs your `DATABASE_URL`
  in `.env`. Everything above ran against a local, stock-Postgres-16
  sandbox, which is what `types/index.ts` and `config/db.ts` are written
  against; nothing in either is Neon-specific.

## Structure

```
src/
├── server.ts          entry point — creates the app, starts listening
├── app.ts             assembles middleware + mounts every module's router
├── config/
│   ├── env.ts          loads and validates .env with zod; exits on bad config
│   └── db.ts            pg Pool, built from DATABASE_URL
├── db/
│   └── index.ts          Drizzle client (`drizzle(pool, { schema })`), schema
│                         imported from ../../../db/dist/schema/ (compiled
│                         from ../../db/drizzle/schema/ — the actual source)
├── middleware/
│   ├── errorHandler.ts  catches thrown errors -> JSON response
│   └── notFound.ts       catch-all for unmatched routes
├── types/
│   └── index.ts          row types inferred from ../db's Drizzle schema
│                         ($inferSelect) — never hand-write a type that
│                         duplicates a table's column shape
└── modules/
    └── <resource>/
        ├── <resource>.routes.ts       Express Router, mounted in app.ts
        ├── <resource>.controller.ts   parses the request, calls the service, shapes the response
        └── <resource>.service.ts      the actual pg queries
```

`modules/programs/` is the one resource fully wired end to end
(`GET /api/programs`, `GET /api/programs/:id`) — read it as the pattern to
copy. Every other module (`branches`, `subjects`, `users`, `notes`, `files`,
`tags`, `bookmarks`, `ratings`, `comments`) is currently a single
`<resource>.routes.ts` stub returning `501`, so the URL space is reserved and
every resource has a home, but no business logic exists for it yet.

## Known limitations

- **Refresh tokens are stateless** — logout is client-side only; a leaked
  refresh token remains valid until it expires. See
  `docs/superpowers/specs/2026-09-02-auth-rbac-notes-design.md`.
- **No stale-upload sweeper yet** — `files.upload_status = 'pending'` rows
  from abandoned uploads are not automatically cleaned up. The index
  (`idx_files_stale_uploads`) is in place for when this is added.
- Business logic for `tags`, `bookmarks`, `ratings`, `comments`, and full CRUD
  on `branches`/`subjects` is still out of scope — those remain `501` stubs.

## Extending a stub module

Follow the `programs` module:

1. Write `<resource>.service.ts` — queries against `db`/`schema` from
   `src/db/index.ts` (Drizzle query builder), typed against `types/index.ts`.
2. Write `<resource>.controller.ts` — parse `req.params`/`req.query`/`req.body`,
   call the service, `next(err)` on failure (`errorHandler` handles the rest).
3. Replace the stub body in `<resource>.routes.ts` with real routes calling
   the controller.
4. Nothing else to wire up — `app.ts` already mounts every router at its
   `/api/<resource>` path, stub or not.
