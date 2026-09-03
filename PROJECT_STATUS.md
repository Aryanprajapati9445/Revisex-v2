# Project Status

College notes platform — Postgres (`db/`) + Express API (`backend/`) + React SPA (`frontend/`).

STATUS: IN_PROGRESS — feature-complete against the plan and audited; blocked only on a
manual end-to-end pass that needs credentials (see "Blocked" below).

## Verification snapshot

Last run on branch `worktree-task1-taxonomy-endpoints`:

| Check | Command | Result |
|---|---|---|
| Backend tests | `cd backend && npm test` | 120 passing |
| Backend typecheck | `cd backend && npm run typecheck` | clean |
| Frontend tests | `cd frontend && npm test` | 58 passing |
| Frontend lint | `cd frontend && npm run lint` | clean, no suppressions |
| Frontend typecheck + build | `cd frontend && npm run build` | clean |

`db/dist` must exist before the backend suite runs (`cd db && npm run build`).

## Completed

All 11 tasks of `docs/superpowers/plans/2026-09-02-frontend.md` are implemented, with every
plan checkbox ticked: taxonomy browse, note list/search/detail/download, two-phase S3
upload, my-uploads and settings, moderation queue, and scoped user management, on top of
the Vite/React/Tailwind-v4 scaffold and the API client.

### Post-plan audit

Every frontend API call was then checked against the real backend source rather than the
mocks the tests use. Auth, notes, users and upload shapes all matched. Seven defects were
found and fixed:

1. **User creation was impossible for most admins.** `UserForm` derived the new account's
   scope from the *actor*, but `users_role_scope` keys scope to the role being created. Only
   a branch_admin adding a student could succeed. The form now selects the target scope.
2. **Cached private data survived logout.** The query cache held the user roster and its
   emails, the moderation queue, and own uploads; `staleTime` would have served them to the
   next person signing in on that tab. The cache is now cleared on every session transition.
3. **Soft-removed taxonomy stayed reachable by URL.** The `:id` reads ignored `is_active`,
   so a direct link resolved a row that browse deliberately hides. All three now 404.
4. **Colliding cache keys.** Pickers (limit 100) and paged lists (limit 20) shared a key, so
   whichever resolved first served the other. Limit is now part of the key.
5. **Search hit Postgres per keystroke.** Typing an eight-letter word issued eight full-text
   queries. The term is debounced 300ms before it reaches the URL and the query.
6. **Upload had no client-side guards**, so >10 files or a 0-byte file failed server-side —
   the empty file only *after* its S3 PUT succeeded, stranding a created note.
7. **The 404 route said "not built yet"**, telling visitors an unknown URL was unfinished.

Also: added `GET /api/branches/:id` and `GET /api/subjects/:id`, cleared the one lint
warning, removed dead exports, and added coverage for registration, the route table, and
RoleGate.

## Blocked — needs the owner

**The manual end-to-end pass has never been run.** Every frontend test runs against MSW
mocks. The API contract has now been audited against the backend source, but no request has
travelled frontend → live backend. Completing the plan's "Manual verification" section
(register → browse → upload → approve → download) requires **real AWS S3 credentials** and a
running stack; the upload and download paths cannot be exercised without them.

## Remaining work (not blocking)

1. **Five backend routers still return 501** — `files`, `tags`, `bookmarks`, `ratings`,
   `comments`. Intentional and documented: the frontend renders 501 as a neutral
   "coming soon" panel. Building those resources is separate scope.
2. **`db/dist` is a required build artifact that is gitignored.** A fresh clone or CI run
   must `npm run build` in `db/` first or the backend suite fails to collect.
3. Taxonomy is read-only over HTTP by design; programs/branches/subjects are administered
   directly in the database.

## Architectural decisions

- **`erasableSyntaxOnly` stays on** (the scaffold default). It forbids TypeScript constructor
  parameter properties, so `ApiError` and `UploadError` declare fields explicitly.
- **No `baseUrl` in `tsconfig.app.json`.** TypeScript 6 deprecates it (TS5101); `paths`
  resolves relative to the config file.
- **The refresh call opts out of the 401-refresh cycle** (`RequestOptions.skipAuthRefresh`).
  Without it a rejected refresh token deadlocks: the 401 triggers `refreshOnce()`, whose
  handler calls the same endpoint, and that inner call awaits the promise it runs inside.
- **The query cache is cleared on every session transition** (login, logout, failed refresh).
  Cached data is scoped to an identity and must not outlive it.
- **`is_active = false` is a soft delete, enforced on reads of every shape.** List and detail
  agree, so a URL cannot walk back into a removed program, branch, or subject.
- **Page size is part of the query key** — `PICKER_LIMIT` (100) vs `DEFAULT_LIMIT` (20).
- **Two taxonomy detail endpoints were added** (`/api/branches/:id`, `/api/subjects/:id`)
  because both screens receive only an id and both list endpoints are scoped. Recorded in
  `docs/superpowers/specs/2026-09-02-frontend-design.md`.
- **Search is debounced with the URL as the source of truth**, so results stay shareable and
  the back button still works.
- **Client-side validation mirrors backend limits rather than replacing them.** The server
  still enforces every rule; the client only avoids a doomed round trip.
- **Auth context lives in `auth-context.ts`,** separate from `AuthProvider.tsx`, so the
  provider module exports only a component and Fast Refresh keeps working.

## Next actions

1. Run the manual end-to-end pass once S3 credentials and a running stack are available.
2. Optionally implement the five stubbed resources, if they are in scope.
