# Frontend Visual Redesign — Away From Notion's DNA

**Status:** approved design, ready for implementation planning
**Date:** 2026-09-04
**Supersedes (visually):** `docs/superpowers/specs/2026-09-02-frontend-design.md` and
`docs/superpowers/specs/2026-09-03-discovery-redesign-design.md`, which retoned
shadcn/ui onto tokens measured from `notion.com` (commit `bc15535`). This spec
does not touch the app's information architecture, routing, or data-fetching —
only the visual/interaction layer.

## Goal

Move the existing, already-functional frontend off Notion's specific visual
DNA (warm neutral, document-centric, soft rounding) onto an original,
custom "sleek & technical" design language, and make the app feel materially
more interactive by centralizing motion (Framer Motion) and adding a few
new interactive primitives, rather than relying on static shadcn/ui defaults.

This is a **visual and interaction redesign only**. No new features, no
routing changes, no data-fetching changes. Every page that exists today
still exists, still calls the same hooks/queries, and still renders the
same information — it just looks and moves differently.

## Non-goals

- No new pages or user journeys.
- No backend/API changes.
- No visual regression tooling (Storybook, Playwright screenshots) — this
  repo doesn't have any today and none is being added in this pass. QA is
  manual (dev server + browser) as it has been for prior frontend work.
- No SSR, i18n, or offline support (unchanged from the original frontend spec).

## Design tokens

Dark-first neutral scale, with light mode as a real (not stubbed) secondary
theme built from the same token names so components carry no mode-specific
branching logic:

| Token | Dark | Light |
|---|---|---|
| `background` | `#0B0D10` | `#F7F7F8` |
| `surface` | `#14171B` | `#FFFFFF` |
| `surface-elevated` | `#1B1F24` | `#F0F1F3` |
| `border` | `#262B31` | `#E2E4E8` |
| `text-primary` | `#E8EAED` | `#14171B` |
| `text-secondary` | `#9AA1AC` | `#5B6270` |
| `accent` | `#6E56CF` | `#6E56CF` |

Accent (`#6E56CF`, indigo/violet) is used only for interactive/active
states — links, primary buttons, focus rings, active nav item, selected
list row — never as decoration. Existing semantic colors (success/warning/
danger), currently tuned for the Notion-derived light surface, get retoned
to sit correctly on both the dark and light surface above; the semantic
meaning (approve/reject/pending in moderation, upload status) is unchanged.

Typography: keep `@fontsource-variable/inter` for UI text (already
installed). Add `@fontsource-variable/jetbrains-mono` for metadata-like
content — subject/branch codes, file sizes, timestamps, upload status
strings — to reinforce the technical feel and give scannable content a
distinct visual register from prose/headings.

Shape: corners move from the current soft/Notion-style rounding to a
sharper 4–6px radius across cards, buttons, inputs, and dialogs. Shadows
stay minimal (this app already avoids heavy shadows); dark-mode elevated
surfaces distinguish via the `surface` → `surface-elevated` step and border
color rather than drop shadow.

These become Tailwind v4 theme tokens (this repo is on Tailwind 4's
CSS-first `@theme` config, per `frontend/src/index.css`), replacing the
Notion-derived custom properties currently defined there. shadcn/ui
components are re-themed via those tokens — not replaced or re-scaffolded.

## Motion & interaction architecture

New dependencies: `framer-motion` (the Framer Motion / "Motion for React"
package) and `cmdk` (command palette primitive, unstyled, themed to match).

Motion is centralized in `frontend/src/components/motion/` as a small set
of reusable primitives, rather than ad hoc animation scattered per page:

- **`PageTransition`** — wraps the router `Outlet`; on route change,
  outgoing content fades out and incoming content fades in with an 8px
  vertical slide, via `AnimatePresence` keyed on `location.pathname`.
- **`Reveal`** — fade + upward slide when a section/card scrolls into
  view (`whileInView`, `viewport={{ once: true }}`), used for page
  sections and standalone cards (e.g. `NoteDetailPage` metadata blocks).
- **`Stagger` / `StaggerItem`** — orchestrates list children (note cards
  in `SearchPage`/`SubjectNotesPage`/`HomePage`, rows in admin tables) so
  items cascade in on mount/filter-change instead of appearing at once.
- **Shared micro-interactions**: interactive elements (buttons, links,
  list rows) get `whileTap={{ scale: 0.97 }}`; focus-visible rings use the
  accent color. shadcn `Dialog`, `Sheet`, and `DropdownMenu` enter/exit
  animations move from the current `tailwindcss-animate` CSS classes to
  Framer Motion variants (spring-based open/close) for springier, more
  "alive" motion than the current linear CSS transitions.
- **Command palette** (`Ctrl+K` / `Cmd+K`): global quick navigation +
  search, built on `cmdk`, styled with the new tokens, opens with a
  scale+fade transition via the shared dialog motion variant. Surfaces:
  jump to a program/branch/subject, jump to search, jump to "my uploads"
  / moderation queue for authenticated users with the right role.

All motion is gated behind a shared `useReducedMotion` hook (wrapping
Framer Motion's own `useReducedMotion`) so `prefers-reduced-motion: reduce`
disables non-essential transitions (page slides, stagger delays, tap
scale) while keeping instant state changes functionally intact.

## Rollout scope

Full redesign in one pass — every existing page and shared component
migrates to the new tokens and motion primitives:

- Pages: `HomePage`, `SearchPage`, `NoteDetailPage`, `SubjectNotesPage`,
  `SubjectsPage`, `BranchesPage`, `ProgramsPage`, upload flow, moderation
  queue, user management, profile/account settings.
- Shared components: `PageHeader`, `LoadingState`, `SearchInput`, and the
  shadcn/ui primitives in `frontend/src/components/ui` (re-themed in
  place, same component API).
- Empty/loading/error states get the same visual pass as their parent
  pages, so nothing looks half-migrated (e.g. a dark-themed page with a
  stray light-themed skeleton).

Explicitly unchanged: TanStack Query hooks, route definitions, form
validation logic, API client, auth/session handling. This is a rendering
and interaction-layer change, not a logic change.

## Testing

Existing tests under `frontend/src/test` should keep passing without
rewrites — they exercise data-fetching and interaction logic, not exact
markup/classes, and Framer Motion components render as plain DOM nodes
under jsdom (no jsdom animation APIs required for `initial`/`animate`
props to no-op safely). Two things to verify during implementation:

1. Whether `whileInView` (`Reveal`) needs an `IntersectionObserver`
   mock/stub in the vitest/jsdom environment — it likely does, since
   jsdom doesn't implement `IntersectionObserver`.
2. That `AnimatePresence`-driven route transitions don't break existing
   route-change assertions in tests that check for post-navigation
   content (may need `await` on animation completion, or tests should
   query for content that appears regardless of animation state).

No visual regression tooling is added; visual QA is manual via dev server.

## New: public landing page

No landing page exists today — `/` renders `HomePage`, which is a
data-driven browse hub (real programs + approved notes) more suited to an
authenticated dashboard than a first-impression marketing page. This
redesign adds one:

- **Route**: `/` becomes a new public `LandingPage`
  (`frontend/src/routes/LandingPage.tsx`) — first impression of the
  product, so it gets deliberate motion/design attention, not just token
  reuse from other pages.
- **`HomePage` relocates to `/home`**, wrapped in `ProtectedRoute` (the
  same pattern already used for `/upload`, `/my-uploads`, `/settings`,
  `/moderate`, `/admin/users`) so navigating there while logged out
  redirects to `/login` rather than rendering the dashboard. `HomePage`'s
  internals, data-fetching, and features are unchanged — only its route
  and auth-gating change.
- **Post-login/register redirect** target changes from `/` to `/home`.
- **Other public browse routes are unaffected**: `/browse`,
  `/programs/:programId`, `/branches/:branchId`, `/subjects/:subjectId`,
  `/notes/:noteId` stay exactly as they are today (anonymous-accessible),
  per the original frontend spec's "anonymous browse" scope. Only the
  root route and the `HomePage` dashboard it used to serve are gated.
- **Content** (static copy, no data fetching — consistent with "no logic
  changes" above), top to bottom:
  1. **Hero** — product name/wordmark, one headline stating what the
     platform is, one supporting line on who it's for, primary CTA
     (Register) + secondary CTA (Log in). Animates in on load via the
     `Reveal` primitive (not scroll-triggered — it's above the fold).
  2. **Value prop** — a short paragraph on why the product exists
     (organized, moderated, program → branch → subject structured notes,
     vs. scattered files/links).
  3. **Feature highlights** — 3-4 cards (browse by program/branch/
     subject, search, upload your own notes, moderation-reviewed
     quality), entering via `Stagger`/`StaggerItem` as they scroll into
     view.
  4. **Closing CTA** — repeats Register/Login so a scrolled visitor
     doesn't have to scroll back to the hero.
- Uses the same dark-first token system as the rest of the app — it's the
  front door to the same design system, not a separately-branded
  marketing page.

## Open implementation notes (for the plan, not decisions to re-litigate)

- Package additions: `framer-motion`, `cmdk`,
  `@fontsource-variable/jetbrains-mono`.
- `frontend/src/index.css` `@theme` block gets its color tokens replaced;
  audit for any component reading a Notion-specific token name directly
  rather than through the shared token layer.
- A theme (dark/light) toggle needs a persistence mechanism (e.g.
  `localStorage` + `prefers-color-scheme` default) — dark is the default/
  primary mode per this spec, light is available but secondary.
