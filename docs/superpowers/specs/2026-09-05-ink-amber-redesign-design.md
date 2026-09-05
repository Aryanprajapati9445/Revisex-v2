# Ink & Amber redesign — design spec

Date: 2026-09-05
Status: approved by user, pending implementation plan

## Context

The current shipped theme ("sleek & technical": near-black neutrals, single
indigo/violet `#6E56CF` accent, Inter + JetBrains Mono) was itself a
replacement for an earlier Notion-DNA clone that read as too derivative. The
user now wants a further, deliberate departure — not a landing-page-only
tweak, but a new visual identity for the whole app — plus a landing page
that reads as premium/interactive and pulls a first-time visitor through to
the end rather than losing them partway down.

Both changes are in scope together because they compound: a stronger visual
identity needs a landing page built to show it off, and a landing page
rewrite is wasted if the app underneath still looks like the old theme the
moment someone logs in.

## Goals

1. Replace the app-wide indigo/violet dark theme with a new, distinct
   direction: **"Ink & Amber"** — warm dark neutrals, a single deep-gold
   accent, a serif display face paired with the existing sans body face.
2. Elevate the landing page's interaction and motion quality (premium,
   "alive" feel) using the motion primitives already in the codebase
   (`Reveal`, `Parallax`, `Stagger`, `ScrollProgress`) — no new animation
   library.
3. Rewrite landing page copy so each section creates a reason to keep
   scrolling (problem → agitate → resolve arc), without introducing
   fabricated social proof — `PullQuote` stays a real/plain quote.

## Non-goals

- No backend, routing, or data-fetching changes.
- No change to the underlying page/section structure of the app beyond the
  landing page (dashboard, notes browser, upload flow, moderation, admin
  keep their current layouts — only their *token-derived* colors/type
  change, because they read the same `@theme` variables).
- No new dependencies for motion/interaction (reuse existing Framer Motion
  primitives).
- Not attempting to fabricate testimonials, fake user counts, or other
  false social proof to "look more premium."

## 1. Design tokens — "Ink & Amber"

All tokens live in `frontend/src/index.css`'s `@theme` block, which is
already the single source of truth — shadcn's generated primitives
(`Button`, `Dialog`, `Input`, `Table`, ...) read the bridged variable names
at the bottom of that block, so retoning the base values cascades
automatically without touching component code.

### Dark (default)

| Token | Old (indigo) | New (Ink & Amber) |
|---|---|---|
| `--color-background` | `#0b0d10` | `#0e0c0a` |
| `--color-surface` | `#14171b` | `#17140f` |
| `--color-surface-elevated` | `#1b1f24` | `#1f1a14` |
| `--color-border` | `#262b31` | `#2b241c` |
| `--color-text-primary` | `#e8eaed` | `#f0ead9` |
| `--color-text-muted` | `#9aa1ac` | `#a89a86` |
| `--color-text-tertiary` | `#6b7280` | `#746a5b` |
| `--color-primary` | `#6e56cf` | `#d9a441` |
| `--color-primary-foreground` | `#ffffff` | `#1f1508` |
| `--color-accent` | `#23273a` | `#2b2210` |
| `--color-accent-foreground` | `#a996f0` | `#e6b64f` |

Status pills retoned to sit on the new warm surface, and `pending` shifted
away from gold (to avoid reading as the same color as the new primary
accent):

| Token | New value |
|---|---|
| `--color-status-pending-bg` | `#33230f` |
| `--color-status-pending-fg` | `#e08a3c` |
| `--color-status-approved-bg` | `#16241c` |
| `--color-status-approved-fg` | `#4ade80` |
| `--color-status-rejected-bg` | `#33201e` |
| `--color-status-rejected-fg` | `#f87171` |

### Light (`:root[data-theme="light"]`)

Replaces the old violet-tinted light mirror with a warm "paper" palette so
light mode reads as part of the same identity, not a leftover from the
previous theme:

| Token | New value |
|---|---|
| `--color-background` | `#faf6ee` |
| `--color-surface` | `#ffffff` |
| `--color-surface-elevated` | `#f3ecdd` |
| `--color-border` | `#e5dcc8` |
| `--color-text-primary` | `#241d12` |
| `--color-text-muted` | `#6b5f4d` |
| `--color-text-tertiary` | `#948a78` |
| `--color-accent` | `#fdeecd` |
| `--color-accent-foreground` | `#a3701e` |
| `--color-status-pending-bg` | `#fdead2` |
| `--color-status-pending-fg` | `#9a5a12` |
| `--color-status-approved-bg` | `#dcf3e4` |
| `--color-status-approved-fg` | `#1a6b38` |
| `--color-status-rejected-bg` | `#fbe4e2` |
| `--color-status-rejected-fg` | `#8a2c22` |

### Radius & shadow

- Soften the radius scale slightly: `--radius-panel: 10px`, `--radius-card:
  8px`, `--radius-control: 6px` (was 8/6/4) — a touch less "technical,"
  reads warmer without becoming rounded/playful.
- Add `--shadow-glow-primary: 0 0 32px rgba(217, 164, 65, 0.25)` for hover
  states and hero elements (new token, additive).
- Existing `--shadow-hero` stays reserved for the marketing hero's layered
  mockup only, per the existing app-chrome-stays-flat rule; grain/noise
  texture (new, see Section 3) is likewise reserved for the hero and the
  landing page's closing CTA banner.

### Fonts

- Add `@fontsource-variable/fraunces` (or equivalent self-hosted variable
  serif) alongside the existing Inter/JetBrains Mono imports.
- New `--font-display: "Fraunces Variable", ui-serif, Georgia, serif`,
  applied only to the `display`/`title` text bands (`h1`/`h2`-scale
  headings across the app, not body/UI text).
- `--font-sans` (Inter) and `--font-mono` (JetBrains Mono) are unchanged —
  body copy, buttons, form controls, tables, and the decorative mono
  caption labels keep their current face so no component's measured
  sizing/line-height assumptions break.

## 2. Interaction / motion additions

All built on the motion primitives already in
`frontend/src/components/motion/` — no new animation dependency.

- **Cursor-reactive glow** behind the hero: a radial gradient using
  `--shadow-glow-primary`'s color that follows the pointer within the hero
  section only, implemented as a small new component
  (`components/landing/CursorGlow.tsx`) gated behind
  `prefers-reduced-motion` (no-ops to a static glow if reduced motion is
  set, consistent with the existing reduced-motion rule in `index.css`).
- **Sticky-scroll `ProductShowcase`**: restructure so the product
  screenshot/mockup pins (`position: sticky`) while its accompanying
  feature callouts scroll past beside it, using `Reveal`/`Stagger` for the
  callout entrances. Falls back to the current stacked layout on narrow
  viewports (no sticky below `lg`).
- **Count-up numbers in `StatsStrip`**: numbers animate from 0 to their
  target when the strip enters the viewport (reuse the same
  intersection-observer approach `Reveal` already uses internally, rather
  than adding a new counting library).
- **Hover-tilt on `PreviewCard` and primary CTA buttons**: subtle
  perspective tilt following pointer position on hover (desktop only;
  no-op on touch), using the existing `--perspective-hero` token.

## 3. Content / copy

Rewrite hero and section headers for a tighter arc. Concrete copy (final
wording, not placeholders):

- **Hero**: keep the existing "Stop searching for notes. Start studying."
  headline (already strong, outcome-first) but tighten the supporting line
  to lead with the pain point: *"Every semester, the same notes get retyped,
  re-photographed, and re-lost in five different WhatsApp groups. Yours
  don't have to."*
- **ProblemSection**: sharpen to name the actual failure modes students
  recognize (scattered chats, expired Google Drive links, no way to tell if
  a shared PDF is even the right syllabus version) rather than generic
  "notes are hard to find" framing.
- **HowItWorks / ProductShowcase**: reframe captions around outcomes at each
  step ("find in seconds," "know it's reviewed," "keep your own uploads
  organized") instead of describing the UI literally.
- **Features**: unchanged structure, tightened one-line descriptions to
  active voice.
- **PullQuote**: stays a real, plain quote (no fabricated testimonial),
  per the standing decision from the previous landing page pass.
- **Closing CTA**: unchanged structural pattern, copy tightened to mirror
  the hero's pain-point framing so the page's opening and closing lines
  rhyme.

Exact final strings for each section are written during implementation
(TDD/content pass), not frozen here — this section fixes the *arc and
tone*, not every character.

## 4. Rollout / verification

- Token and font changes are global and centralized (single file), so
  verification means visually checking representative screens beyond the
  landing page: signed-in dashboard, notes list/detail, upload flow,
  moderation queue, an admin table, and both light and dark mode for each.
- Landing page interaction/copy changes are scoped to
  `frontend/src/routes/LandingPage.tsx` and `frontend/src/components/landing/*`.
- Existing tests (`landing-page.test.tsx`, `motion.test.tsx`) get updated
  for the new copy/structure rather than replaced; no test infra changes.
- No backend, API, or routing changes — this is frontend-only.

## Open questions

None outstanding — all decisions above were confirmed with the user during
brainstorming (2026-09-05).
