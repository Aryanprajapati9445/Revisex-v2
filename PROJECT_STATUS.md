# Project Status

College notes platform — Postgres (`db/`) + Express API (`backend/`) + React SPA (`frontend/`).

STATUS: IN_PROGRESS

## Verification snapshot

Last run on branch `worktree-task1-taxonomy-endpoints`:

| Check | Command | Result |
|---|---|---|
| Backend tests | `cd backend && npm test` | 111 passing |
| Frontend tests | `cd frontend && npm test` | 47 passing |
| Frontend lint | `cd frontend && npm run lint` | clean |
| Frontend typecheck + build | `cd frontend && npm run build` | clean |
| Backend typecheck | `cd backend && npm run typecheck` | clean |

## Completed

All 11 tasks of `docs/superpowers/plans/2026-09-02-frontend.md` are implemented and committed
(`a9791e2..`), with every plan checkbox ticked.

- **Task 1 — backend read endpoints.** `GET /api/branches?program_id=`,
  `GET /api/subjects?branch_id=&semester=`, `GET /api/notes/:id/files`. The note-files
  endpoint reuses `getNote`'s visibility rule so out-of-scope notes stay masked as 404.
- **Tasks 2–5 — frontend foundation.** Vite 8 / React 19 / TS 6 scaffold, Tailwind v4
  `@theme` tokens measured from notion.com, API client with envelope unwrapping and
  single-flight refresh, auth provider + guards, app shell and layout primitives.
- **Tasks 6–11 — features.** Taxonomy browse, note list/search/detail/download,
  two-phase S3 upload, my-uploads and settings, moderation queue, user management.

## Known remaining work

1. **End-to-end verification has never been run.** Every frontend test runs against MSW
   mocks. The API contract has since been audited against the real backend source (see
   decisions below), but no request has ever travelled frontend → live backend. The plan's
   own "Manual verification" section is unrun; it needs a running backend, the Postgres
   sandbox, and real S3 credentials.
2. **Five backend routers still return 501** — `tags`, `bookmarks`, `ratings`, `comments`,
   `files`. This is intentional and documented: the frontend renders 501 as a neutral
   "coming soon" panel, not an error. Building those resources is a separate scope.
3. **`db/dist` is a required build artifact that is gitignored.** `backend/src/db/index.ts`
   imports `../../../db/dist/schema/index.js`. A fresh clone or CI run must execute
   `npm run build` in `db/` first, or the backend suite fails to collect.

## Architectural decisions

- **`erasableSyntaxOnly` is kept on** (the Vite scaffold's default). It forbids TypeScript
  constructor parameter properties, so `ApiError` and `UploadError` declare and assign their
  fields explicitly. Keeping the strict setting is worth more than the shorthand.
- **No `baseUrl` in `tsconfig.app.json`.** TypeScript 6 deprecates it (TS5101); `paths`
  resolves relative to the config file, which is what the `@/*` alias already assumed.
- **The refresh call opts out of the 401-refresh cycle** (`RequestOptions.skipAuthRefresh`).
  Without it a rejected refresh token deadlocks: the 401 triggers `refreshOnce()`, whose
  handler calls the same endpoint, and that inner call awaits the in-flight promise it is
  running inside.
- **Page size is part of the query key.** A picker asking for 100 rows and a paged list
  asking for 20 are different results; sharing a key let whichever resolved first serve the
  other a truncated or oversized page. `PICKER_LIMIT` (100) vs `DEFAULT_LIMIT` (20) in
  `lib/query-keys.ts`.
- **`UserForm` selects the target account's scope rather than inheriting the actor's.** The
  backend's `users_role_scope` rule keys scope to the role being created, not the creator.
- **Client-side validation mirrors backend limits rather than replacing them.** Upload
  guards (≤10 files, non-empty) and the rejection-reason check exist to avoid a doomed
  round trip; the server still enforces every rule.
- **Auth context lives in `auth-context.ts`, separate from `AuthProvider.tsx`,** so the
  provider module exports only a component and React Fast Refresh keeps working.

## Next actions

1. Continue the contract/security audit of the remaining frontend↔backend seams.
2. Broaden test coverage on untested UI (`RegisterForm`, `TopNav`, `SubjectNotesPage`).
3. Run the manual end-to-end pass once credentials and a running stack are available.
