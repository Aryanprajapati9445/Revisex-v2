# Discovery Category Redesign — Design Spec

**Status:** approved design, ready for implementation planning
**Date:** 2026-09-03
**Depends on:** `2026-09-02-frontend-design.md` (the original full-app build, already implemented) and the design-direction files `design.md` / `DESIGN_EVOLUTION.md` / `DESIGN_PAGES.md` at the repo root
**Category:** Discovery — HomePage, SearchPage, ProgramsPage, BranchesPage, SubjectsPage, SubjectNotesPage, NoteDetailPage

## Why this spec exists

The original build (`2026-09-02-frontend-design.md`) shipped the whole app
retokened onto measured Notion values. `design.md` / `DESIGN_EVOLUTION.md`
now call for evolving past a literal Notion clone into the product's own
visual identity, and this is the first of three category-scoped follow-up
passes (Discovery, then User Workflow, then Administration — each gets its
own spec).

Investigation before this spec confirmed:

- **`BrowsePage.tsx` does not exist** and never did; its role is genuinely
  split across `ProgramsPage → BranchesPage → SubjectsPage` (taxonomy
  drill-down) and `SearchPage` / `SubjectNotesPage` (note listing). Any
  design-doc reference to a "Browse" experience means this split, not a
  page to create.
- 6 of the 7 Discovery pages (`SearchPage`, `ProgramsPage`, `BranchesPage`,
  `SubjectsPage`, `SubjectNotesPage`, `NoteDetailPage` partially) already
  consume real hooks and already use `NoteCard` / `TaxonomyCard` and the
  design-token classes. No legacy/mock styling remains to migrate.
- `HomePage.tsx` (152 lines) is the outlier: it still uses generic
  `Card`/`Button` rather than the shared domain components, and is the
  highest first-impression priority page per `design.md` §23.
- `NoteDetailPage.tsx` (43 lines) is thin relative to `design.md` §26's "is
  this the note I need?" requirement.
- `components/layout/PageHeader.tsx` and `LoadingState.tsx` were planned in
  the original spec's file tree but were never built — confirmed absent on
  disk. `SearchInput` was never planned or built either.
- **Note records carry no denormalized names.** `notes` has only
  `subject_id` and `uploader_id`; subject/branch/program names must be
  resolved via `useSubject`/`useBranch`/`useProgram`. There is no public
  endpoint to resolve a user id to a display name.

## Decision: omit uploader

`design.md` §21 lists "uploader" as note metadata to display. No public
endpoint resolves `uploader_id` to a display name, so Note Detail **omits
uploader entirely** rather than inventing or guessing it. This is a
documented backend gap, not an oversight — a future `GET /api/users/:id`
public read (name only) would be required to add it, and is out of scope
here.

## Scope

In scope — the 7 Discovery pages, plus the shared components they need:

1. **New shared components** (`components/layout/`): `PageHeader`,
   `LoadingState`. (`components/ui/`): `SearchInput`.
2. **HomePage rebuild**: replace the generic Card/Button hero with one built
   from real data — actual programs and actual approved notes via existing
   hooks, rendered with `TaxonomyCard`/`NoteCard`. No fabricated stats;
   any count shown must come from a real paginated response's `total`, not
   a guess. If no real "recent notes" or "counts" query exists yet, the
   hero demonstrates the hierarchy structurally (Program → Branch →
   Subject → Notes) without inventing numbers.
3. **NoteDetailPage expansion**: surface every real field — `title`,
   `note_type`, `exam_year`, `status`, `download_count`, `description`,
   `created_at`/`updated_at`, and the file list (`original_filename`,
   `mime_type`, `page_count`, `size_bytes`) — plus subject/branch/program
   name resolved for breadcrumb context. Primary action (download) must
   respect the existing auth/approval visibility rule already enforced
   server-side.
4. **Consistency pass** on `ProgramsPage`, `BranchesPage`, `SubjectsPage`,
   `SubjectNotesPage`, `SearchPage`: adopt `PageHeader` and `LoadingState`
   where headers/loading are currently ad hoc; verify `Breadcrumbs` is used
   consistently through the Program→Branch→Subject drill-down; verify
   `EmptyState`/`ErrorState` (both already exist) are actually wired on
   every data-fetching page, with copy honest about anonymous visibility
   (e.g., an empty subject notes list should not claim "no notes exist" when
   pending/rejected notes may simply be hidden from this viewer).
5. No functional/backend changes. No new API calls beyond what existing
   hooks already support.

Out of scope: User Workflow pages, Administration pages (own specs later);
any backend endpoint changes; tags/bookmarks/ratings/comments (still `501`
per the original spec, unchanged here).

## Component designs

### `PageHeader`

Props: `title`, optional `description`, optional right-aligned action slot
(e.g. a "Search" entry point on SearchPage, nothing on read-only taxonomy
pages). Replaces each page's current one-off `<h1>` + description markup.
Built from the existing type scale (`display`/`section title` bands
already defined in the token system) — no new typography values invented.

### `LoadingState`

Skeleton-based, matching the shape of what it's replacing per page: a card
grid skeleton for `TaxonomyCard`/`NoteCard` listings, a detail skeleton for
`NoteDetailPage`. Reuses the existing radius/surface tokens. Replaces any
full-page spinner per `design.md` §32.

### `SearchInput`

A single reusable control wrapping the existing `Input` primitive with a
leading search icon and clear affordance, used on `SearchPage` (primary)
and optionally surfaced as a homepage entry point linking to
`/search?q=`. No new search capability — it only triggers the existing
`GET /api/notes?q=` path already wired through `useNotes`.

## Page-by-page detail

### HomePage

Current: generic `Card`/`Button` layout with no real backend data model
visible in the design draft, 152 lines.

New: a hero built from `useProgramsQuery` (already exists) rendered as
`TaxonomyCard`s, and a "recent notes" or "browse notes" section using
`useNotes` (approved-only, as anonymous viewers already see) rendered as
`NoteCard`s. A single clear primary CTA (search or browse) per `design.md`
§23. No testimonials, no fake activity, no invented stats — if the backend
has no "total notes" or "total programs" count surfaced anywhere, the
hero does not claim one.

### NoteDetailPage

Current: 43 lines, thin.

New: full metadata display (see Scope §3), file list via existing
`useNoteFiles`, breadcrumb resolved via `useSubject`/`useBranch`/
`useProgram` chained from the note's `subject_id`, status shown via the
existing `StatusPill`, and a clear primary download action gated by the
same visibility the backend already enforces (no new client-side
permission logic — the client renders whatever the API returns, per the
existing spec's stated principle).

### ProgramsPage / BranchesPage / SubjectsPage / SubjectNotesPage / SearchPage

No structural change — these already use the right domain components and
real data. Changes are limited to: swap ad hoc headers for `PageHeader`,
swap any spinner/placeholder loading markup for `LoadingState`, verify
`EmptyState`/`ErrorState` wiring and copy accuracy, and (SearchPage only)
adopt `SearchInput`.

## States

Every page in scope must have a real (not placeholder) loading state via
`LoadingState`, a real empty state via `EmptyState` with copy specific to
that page's data (not generic "no results"), and a real error state via
`ErrorState`. Anonymous-visibility nuance (approved-only) must be reflected
honestly in empty-state copy where relevant (SubjectNotesPage, SearchPage,
NoteDetailPage's 404 case already follows the neutral-404 rule from the
original spec).

## Testing / verification

Manual verification after implementation: run the dev server, visit all 7
pages both logged-out and logged-in (as a regular user), confirm real data
renders (no console errors, no undefined fields), confirm the download
action on NoteDetailPage calls the real endpoint, and check responsive
behavior at mobile/tablet/desktop widths. No new automated test
infrastructure is introduced by this spec; existing Vitest/Testing
Library/MSW patterns from the original spec are reused for any new
component (`PageHeader`, `LoadingState`, `SearchInput`) that needs
coverage.

## Risks

- **HomePage's "recent notes" section depends on whether a suitable
  existing query exists** (e.g., a default-sorted `useNotes()` call
  without filters). If the only available note list requires a
  `subject_id`, the homepage must not fabricate a global "recent" feed
  that the backend doesn't actually support — this needs confirming during
  implementation before committing to the hero's exact composition.
- **`PageHeader` must not become another place borders creep in** — the
  original spec's "no borders" rule (§ Two rules that override shadcn
  defaults) applies to it same as everything else.
