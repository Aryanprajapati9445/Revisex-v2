# Frontend Design — College Notes Platform

**Status:** approved design, ready for implementation planning
**Date:** 2026-09-02
**Depends on:** the merged `auth-rbac-notes` work (backend at `fea5074`) and the Drizzle schema in `db/drizzle/schema/`
**Design taste source:** `notion.com.md` / `notion.com.json` at the repo root, produced by the `taste` skill against `https://www.notion.com/` on 2026-09-02

## Goal

A React SPA covering every user journey the backend already supports: browsing
the program → branch → semester → subject hierarchy, searching and reading
notes, uploading notes through the two-phase S3 flow, moderating the pending
queue, and managing users — all styled from design tokens measured off Notion
rather than invented.

## Scope

In scope:

- Anonymous browse, search, note reading, and file download
- Register / login / refresh / logout, and the authenticated profile
- Note upload (create → presign → PUT to S3 → complete) and "my uploads"
- Moderation queue (approve / reject with reason), scope-filtered by role
- User management (scoped roster, create / edit / delete)
- Three small backend read endpoints the browse hierarchy cannot work without
  (see "Backend prerequisite")

Out of scope for this pass:

- Tags, bookmarks, ratings, and comments. Those routers still return `501`;
  the UI renders a "coming soon" state for them rather than pretending.
- Any change to the notes/users/auth business logic. The frontend consumes the
  API as it stands.
- Server-side rendering, i18n, dark mode, offline support, E2E tests.

## Backend prerequisite

The product's signature navigation is program → branch → semester → subject →
notes, but `branches` and `subjects` are `501` stubs today, so nothing can hand
the UI a `subject_id` to filter notes by. Three read endpoints unblock it,
each following the existing `programs` module pattern exactly (routes →
controller → service, paginated, parameterized, standard envelope):

| Endpoint | Auth | Returns |
|---|---|---|
| `GET /api/branches?program_id=&page=&limit=` | public | active branches in a program, `ORDER BY code` |
| `GET /api/subjects?branch_id=&semester=&page=&limit=` | public | active subjects, `ORDER BY semester, code` |
| `GET /api/notes/:id/files` | `optionalAuth` | a note's `uploaded` files, honoring the same visibility rule as `GET /api/notes/:id` |

`GET /api/notes/:id/files` matters independently: today a `fileId` is only ever
returned in the response to `POST /api/notes/:id/files`, so a client that
reloads the page can never construct a download URL for an existing note.

These are the first implementation task, not a separate effort — no frontend
task should ship against a `501`.

## Architecture

`frontend/` is a sibling of `backend/` and `db/`, self-contained with its own
`package.json`, `.env`, and README, matching the convention those two already
follow.

```
frontend/src/
├── app/
│   ├── router.tsx           route table, lazy boundaries
│   └── providers.tsx        QueryClientProvider, AuthProvider, Toaster
├── lib/
│   ├── api-client.ts        fetch wrapper: envelope, ApiError, refresh retry
│   ├── query-keys.ts        one place every cache key is defined
│   └── utils.ts             cn() and small helpers
├── features/
│   ├── auth/                useAuth, login/register forms, ProtectedRoute, RoleGate
│   ├── taxonomy/            programs / branches / subjects queries + cards
│   ├── notes/               list, filters, detail, upload flow, my-uploads
│   ├── moderation/          queue, review dialog
│   └── users/               roster, user form
├── components/
│   ├── ui/                  shadcn primitives, restyled to the tokens
│   └── layout/              AppShell, TopNav, Breadcrumbs, PageHeader, EmptyState
└── routes/                  route components composing features
```

Each `features/<domain>/` owns its queries, mutations, and the components that
consume them, so a domain can be read and changed without opening another.
`components/ui/` holds only presentation primitives with no knowledge of the
API.

**Stack:** React 19, Vite, TypeScript, React Router, TanStack Query, Tailwind
v4 (CSS-first `@theme`), shadcn/ui, Vitest + Testing Library + MSW.

**Integration:** the dev server runs on Vite's default port 5173, which is
already what `backend/src/config/env.ts` defaults `CORS_ORIGIN` to — so the two
talk to each other with no backend change. The API base URL is a frontend env
var (`VITE_API_URL`, default `http://localhost:4000`), never hardcoded.

Tailwind v4 is chosen over v3 specifically because its CSS-first `@theme` block
maps the extracted tokens to custom properties directly, with no JS config
translating between the measured values and the utilities.

## Design system

Tokens come from `notion.com.json`. Values are used as measured, not rounded.

### Color

| Token | Value | Role |
|---|---|---|
| `--color-background` | `#FFFFFF` | page ground (67.3% of Notion's surface) |
| `--color-surface` | `#F9F9F8` | secondary surface, warm (11.6%) |
| `--color-text-primary` | `rgba(0,0,0,0.898)` | body and headings |
| `--color-text-muted` | `#615D59` | secondary text, warm gray |
| `--color-text-tertiary` | `rgba(0,0,0,0.54)` | timestamps, counts, captions |
| `--color-accent` | `#0075DE` | primary button fill and focus ring — nothing else |
| `--color-accent-subtle` | `#E6F3FE` | secondary button fill |

### Type

Two bands, as measured. The app lives almost entirely in the UI band.

- UI band: 12px / 14px (weight 500, the default) / 16px / 20px
- Display band: 42 / 54 / 72 / 96px, weights 600–700, negative tracking scaled
  to size (-4.8% at 96px, -3.5% at 54px, 0 at 14px)

Family: **Inter**. Notion's `NotionInter` is proprietary and cannot be used;
Inter is its upstream, which makes it the faithful substitution — but it is a
substitution, recorded here so nobody later mistakes it for the real face.

### Shape, depth, spacing

- Radius `12px` outer → `8px` default → `4px` inner → `9999px` pills, applied
  with the measured nesting rule (a rounded child inside a rounded parent steps
  down)
- Two 4-layer shadow stacks, copied verbatim from the measurement
- Spacing: macro strictly 8-based (8/16/24/32/64/96); micro deliberately
  optical (3/5/6/10px) inside components
- Motion: `background-color 0.15s`, `box-shadow 0.2s cubic-bezier(0.42,0,1,1)`,
  `transform 0.3s`; `prefers-reduced-motion` respected; `:focus-visible` rings

### Two rules that override shadcn defaults

1. **No borders.** The measurement found zero bordered components across 2000
   sampled elements — separation is done with the shadow stacks and the
   `#FFFFFF` / `#F9F9F8` tint flip. shadcn's `Card`, `Input`, `Select`,
   `Dialog`, and `Table` all ship with `border` on and must have it stripped
   during the restyle. This is the largest visual departure from a stock
   shadcn build and the easiest thing to regress.
2. **Accent stays rationed.** Blue appears on primary button fills and focus
   rings only. Not on inline links, not on active nav (that gets a `#F9F9F8`
   fill), not on icons. Notion spends its accent on 0.2% of surface area across
   three elements; the value of the rule is that one blue thing on screen is
   unambiguously the next action.

### The one documented extension

Notion's marketing page has no semantic status system, but the product
screenshot embedded in its hero does — gray / amber / blue / green pills, 4px
radius, tinted background with darker text. Notes need
`pending` / `approved` / `rejected`, so status pills are built in that idiom
(low-saturation tinted background, darker text of the same hue) rather than as
saturated badges:

| Status | Pill | Rationale |
|---|---|---|
| `pending` | amber tint | matches Notion's "In progress" — work in flight |
| `approved` | green tint | matches "Complete" |
| `rejected` | red tint | no Notion equivalent; the one genuinely new hue, kept at the same low saturation |

File `upload_status` (`pending` / `uploaded` / `failed`) reuses the same three
pills. This is the only part of the palette not directly measured, and it is
extrapolated from the same page rather than invented elsewhere.

## Routes

| Route | Access | Content |
|---|---|---|
| `/login`, `/register` | anonymous | forms; redirect to `/` when already authed |
| `/` | public | program grid, search entry |
| `/programs/:programId` | public | branches in the program |
| `/branches/:branchId?semester=N` | public | semester tabs (1..`duration_semesters`) → subjects |
| `/subjects/:subjectId` | public | notes for the subject, filterable |
| `/notes/:noteId` | public¹ | detail, file list, downloads |
| `/search?q=&note_type=&subject_id=` | public | full-text results |
| `/upload` | authenticated | three-step upload |
| `/my-uploads` | authenticated | own notes with status |
| `/settings` | authenticated | profile (`full_name`), role and scope shown read-only |
| `/moderate` | admin roles | pending queue, approve / reject |
| `/admin/users` | admin roles | scoped roster and CRUD |

¹ Approved notes are public. Pending and rejected notes are visible only to
their uploader or an in-scope admin — enforced server-side; the client just
renders whatever it is given.

Admin routes are gated by `RoleGate` on `superuser | program_admin |
branch_admin`. The gate is a navigation convenience, never a security boundary
— every one of those endpoints re-checks role and scope on the server.

## Data flow

`lib/api-client.ts` is the only module that knows about the response envelope.
It unwraps `{ success: true, data }` and throws
`ApiError(status, code, message)` on `{ success: false, error }`. Every caller
above it deals in plain data and typed errors.

Query keys live in `lib/query-keys.ts` so invalidation never guesses at a
string. List responses carry `{ items, pagination: { page, limit, total,
totalPages } }`; the shared `Pagination` component reads that shape directly.

Mutations invalidate the matching list key. The moderation approve/reject is
the one optimistic update — a queue that visibly removes the row on click is
worth the rollback complexity; nothing else is.

### Auth

`POST /api/auth/login` returns `{ user, accessToken, refreshToken }`. The
access token is held in memory by `AuthProvider`; the refresh token goes to
`localStorage` because it has to survive a reload. On boot, a stored refresh
token is exchanged for a new pair and then `GET /api/auth/me` populates the
user. On a `401`, the client performs a single-flight refresh, retries the
original request once, and otherwise clears state and redirects to `/login`.

This is not presented as a hardened design. In a pure SPA the refresh token is
reachable by any XSS, and the backend's refresh tokens are stateless with no
revocation path — a limitation already recorded in `backend/README.md`. The
frontend inherits it rather than fixing it.

### Upload

The only genuinely sequenced flow:

1. `POST /api/notes` → note in `pending`
2. `POST /api/notes/:id/files` with `{ files: [{ original_filename, mime_type }] }`
   → `[{ file, putUrl }]`
3. `PUT putUrl` with the raw `File` and its `Content-Type`, **direct to S3** —
   a bare `fetch`, not `api-client`: no `Authorization` header, no envelope,
   and an auth header here would break the presigned signature
4. `POST /api/notes/:id/files/:fileId/complete` with `{ size_bytes }`

A failure at step 3 leaves a real note with pending file rows, so the UI
surfaces a retry rather than orphaning them silently. **Retry must treat `409`
as already-done:** `completeFileUpload` is single-shot server-side (its
`WHERE` includes `upload_status = 'pending'`), so re-completing an uploaded
file returns `409 CONFLICT`, which is success from the client's point of view,
not an error to show.

## Error handling

Errors are handled by `code`, not by status number alone:

| Code | Status | UI |
|---|---|---|
| `VALIDATION_ERROR` | 422 | inline field error; the backend formats `message` as `"field: reason"` |
| `VALIDATION_ERROR` | 400 | inline or toast — malformed id in the path |
| `UNAUTHENTICATED` | 401 | silent refresh, then retry or redirect |
| `FORBIDDEN` | 403 | toast; stay on the page |
| `NOT_FOUND` | 404 | neutral not-found panel |
| `EMAIL_TAKEN` | 409 | inline on the email field |
| `CONFLICT` | 409 | upload retry path only: treat as success |
| `NOT_IMPLEMENTED` | 501 | "coming soon" panel |
| `INTERNAL_ERROR` | 500 | generic failure state with retry |

Two of these carry real constraints:

- **404 copy must stay neutral.** The backend masks out-of-scope resources as
  `404` precisely so an out-of-scope actor cannot tell "exists but forbidden"
  from "does not exist". Copy like "you don't have permission to view this"
  would hand back exactly what the masking hides. The panel says the note or
  user was not found, and nothing else.
- **501 is a real state, not a failure.** Seven routers still return it. The
  UI treats it as "not built yet" with no error styling.

A route-level error boundary catches render failures; mutation failures surface
as toasts.

## Testing

Vitest + Testing Library, with MSW serving the API so tests exercise real
request/response shapes rather than mocked hooks.

The flows worth locking down:

- An unauthenticated visit to a protected route redirects to `/login`
- `RoleGate` hides admin navigation for a student and shows it for a
  `branch_admin`
- The upload flow issues its four calls in order with the right payloads, and
  the S3 `PUT` carries no `Authorization` header
- A retried `complete` that returns `409` is reported as success
- Rejecting a note without a reason surfaces the `422` inline
- A `404` renders the neutral panel, with an explicit assertion that the copy
  contains no permission language
- Pagination controls move through `data.pagination`

E2E is out of scope here, though Playwright is already available in the repo if
it is wanted later.

## Accessibility

The measurement found Notion respects both `:focus-visible` and
`prefers-reduced-motion`, so the port keeps them: visible focus rings drawn in
the accent at low alpha, and every transition disabled under reduced motion.
shadcn's primitives supply the dialog focus trapping, labelling, and keyboard
semantics — which is a substantial part of why they were chosen over
hand-rolled components.

Because the design has no borders, focus and hover states carry more of the
affordance load than usual: hover is a `#F9F9F8` fill, focus is a ring. Neither
may be dropped during the restyle.

## Risks

- **Borderless styling regresses easily.** Every shadcn component added later
  arrives with `border` on by default. Worth a lint rule or a review checklist
  item rather than vigilance.
- **The upload flow is the only multi-step client orchestration** and the only
  place the client talks to something other than the API. It carries the most
  failure modes and deserves the most test coverage.
- **Inter is not NotionInter.** Metrics differ slightly; the measured negative
  tracking values may need small optical adjustment at display sizes.
- **The three new endpoints are on the critical path.** Every browse route is
  blocked until they land, which is why they are task one.
