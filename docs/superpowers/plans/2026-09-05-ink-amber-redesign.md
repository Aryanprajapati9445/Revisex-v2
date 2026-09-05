# Ink & Amber Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app-wide indigo/violet dark theme with a new "Ink & Amber" warm gold identity, add premium scroll/hover interactions to the landing page, rewrite its copy for a tighter narrative arc, and remove `prefers-reduced-motion` handling app-wide.

**Architecture:** All color/type/radius/shadow tokens live in one file (`frontend/src/index.css`'s `@theme` block), so the retone is a token-value swap that cascades to every shadcn-derived component automatically — no per-component color edits. Landing-page interactions are new small components (`AnimatedNumber`, `CursorGlow`, `Tilt`) built the same way the existing motion primitives (`Reveal`, `Parallax`, `Stagger`) are: a thin wrapper around Framer Motion, each independently testable. Copy changes preserve every heading/link string the existing tests assert on, so no test file needs to change for the copy pass itself.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind CSS v4 (`@theme` CSS-first config), Framer Motion 13, Vitest + Testing Library + MSW.

**Spec:** `docs/superpowers/specs/2026-09-05-ink-amber-redesign-design.md`

## Global Constraints

- Frontend-only. No backend, API, or routing changes.
- No new dependencies for motion/interaction — reuse Framer Motion, already a dependency.
- One new font dependency only: a variable Fraunces package (`@fontsource-variable/fraunces`), applied to `display`/`title` text bands only — body/UI text stays Inter.
- `prefers-reduced-motion` support is removed entirely, app-wide (explicit user decision, documented in the spec's "Accessibility trade-off" section). Do not re-add gating anywhere.
- `PullQuote` stays a plain, real statement — never add a fabricated testimonial, name, or invented adoption number.
- Every existing test must still pass after each task; run `npm test` (from `frontend/`) at the end of every task, not just the final one.
- Preserve every string the existing tests assert on verbatim: the hero heading text matching `/stop searching for notes/i`, the "Get started"/"Log in" link labels and their `href`s, and the four `Features` card titles ("Browse by course", "Community reviewed", "Search instantly", "Give back"). Copy changes in this plan only touch body/description text, never these.

---

### Task 1: Retone the dark theme's color tokens

**Files:**
- Modify: `frontend/src/index.css:6-31` (the dark `@theme` color tokens)

**Interfaces:**
- Produces: no new token *names* — only new values for `--color-background`, `--color-surface`, `--color-surface-elevated`, `--color-border`, `--color-text-primary`, `--color-text-muted`, `--color-text-tertiary`, `--color-primary`, `--color-primary-foreground`, `--color-accent`, `--color-accent-foreground`, `--color-status-pending-bg`, `--color-status-pending-fg`, `--color-status-approved-bg`, `--color-status-rejected-bg`. Every later task and every existing component keeps reading these same names.

- [ ] **Step 1: Replace the dark palette values**

In `frontend/src/index.css`, replace the block from `--color-background` through the status-pill tokens (currently lines 8–30) with:

```css
  /* Surfaces — dark-first, "Ink & Amber" warm neutral scale */
  --color-background: #0e0c0a;
  --color-surface: #17140f;
  --color-surface-elevated: #1f1a14;
  --color-border: #2b241c;

  /* Text */
  --color-text-primary: #f0ead9;
  --color-text-muted: #a89a86;
  --color-text-tertiary: #746a5b;

  /* Brand — the ONE accent, interactive states only. */
  --color-primary: #d9a441;
  --color-primary-foreground: #1f1508;
  --color-accent: #2b2210;
  --color-accent-foreground: #e6b64f;

  /* Status pills — retoned to sit on the warm dark surface above.
     `pending` is shifted off gold so it doesn't read as the same color
     as the new primary accent. */
  --color-status-pending-bg: #33230f;
  --color-status-pending-fg: #e08a3c;
  --color-status-approved-bg: #16241c;
  --color-status-approved-fg: #4ade80;
  --color-status-rejected-bg: #33201e;
  --color-status-rejected-fg: #f87171;
```

- [ ] **Step 2: Run the full test suite**

Run: `cd frontend && npm test`
Expected: PASS — this is a pure value swap on token names every component already reads; no test asserts specific color values.

- [ ] **Step 3: Manual visual check**

Run: `cd frontend && npm run dev`, open the app in a browser, and check: landing page (`/`), login (`/login`), signed-in dashboard (`/home`), a notes list, and one dialog/modal. Confirm the warm dark palette renders (no leftover indigo/violet), text stays legible against the new background, and the accent gold shows correctly on primary buttons and links.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(frontend): retone dark theme to Ink & Amber palette"
```

---

### Task 2: Retone the light theme's color tokens

**Files:**
- Modify: `frontend/src/index.css:98-121` (the `:root[data-theme="light"]` block)

**Interfaces:**
- Consumes: same token names as Task 1 (this is the light-mode override of them).
- Produces: nothing new — same names, new "warm paper" values.

- [ ] **Step 1: Replace the light palette values**

Replace the `:root[data-theme="light"]` block's color values with:

```css
:root[data-theme="light"] {
  --color-background: #faf6ee;
  --color-surface: #ffffff;
  --color-surface-elevated: #f3ecdd;
  --color-border: #e5dcc8;

  --color-text-primary: #241d12;
  --color-text-muted: #6b5f4d;
  --color-text-tertiary: #948a78;

  --color-accent: #fdeecd;
  --color-accent-foreground: #a3701e;

  --color-status-pending-bg: #fdead2;
  --color-status-pending-fg: #9a5a12;
  --color-status-approved-bg: #dcf3e4;
  --color-status-approved-fg: #1a6b38;
  --color-status-rejected-bg: #fbe4e2;
  --color-status-rejected-fg: #8a2c22;

  --shadow-raised: 0 1px 2px rgba(36, 29, 18, 0.06), 0 0 0 1px var(--color-border);
  --shadow-floating: 0 8px 24px rgba(36, 29, 18, 0.1), 0 0 0 1px var(--color-border);
  --shadow-hero: 0 24px 60px rgba(36, 29, 18, 0.14), 0 0 0 1px var(--color-border);
}
```

(Only the shadow rgba tint changes — from the old neutral `rgba(20, 23, 27, ...)` to the new warm-ink `rgba(36, 29, 18, ...)` so shadows match the new text-primary hue instead of the old theme's.)

- [ ] **Step 2: Run the full test suite**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 3: Manual visual check**

With the dev server still running, use the app's theme toggle to switch to light mode and re-check the same pages from Task 1's Step 3 (landing, login, dashboard, notes list, a dialog).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(frontend): retone light theme to warm paper palette"
```

---

### Task 3: Soften the radius scale and add the glow shadow token

**Files:**
- Modify: `frontend/src/index.css:32-44` (radius + shadow tokens)
- Modify: `frontend/src/components/ui/button.tsx:8-9` (a stale comment referencing the old radius numbers)

**Interfaces:**
- Produces: `--radius-panel` (10px, was 8px), `--radius-card` (8px, was 6px), `--radius-control` (6px, was 4px), and a new `--shadow-glow-primary` token. `--radius-sm/-md/-lg/-xl` (the shadcn bridge) are derived from these by reference, so they update automatically — no edit needed there.

- [ ] **Step 1: Update the radius values and add the glow token**

In `frontend/src/index.css`, change:

```css
  --radius-panel: 8px;
  --radius-card: 6px;
  --radius-control: 4px;
```

to:

```css
  --radius-panel: 10px;
  --radius-card: 8px;
  --radius-control: 6px;
```

and change the nesting-rule comment above them from `/* Radius — sharper nesting rule: 8 outer -> 6 default -> 4 inner */` to `/* Radius — nesting rule: 10 outer -> 8 default -> 6 inner */`.

Then add the new glow token immediately after `--shadow-hero`:

```css
  --shadow-hero: 0 24px 60px rgba(0, 0, 0, 0.55), 0 0 0 1px var(--color-border);
  /* Warm accent glow — hover states and the new landing-page interactions
     (CursorGlow, Tilt) only. Not used in app chrome. */
  --shadow-glow-primary: 0 0 32px rgba(217, 164, 65, 0.25);
  --perspective-hero: 1400px;
```

- [ ] **Step 2: Fix the stale comment in `button.tsx`**

In `frontend/src/components/ui/button.tsx`, the comment above `buttonVariants` currently reads:

```
// rounded-full (not rounded-md): every CTA in this design is a pill —
// radius-control/-card are reserved for cards and inputs, per the
// "nesting rule: 12 outer -> 8 default -> 4 inner" in index.css.
```

Change `"nesting rule: 12 outer -> 8 default -> 4 inner"` to `"nesting rule: 10 outer -> 8 default -> 6 inner"` so it matches the corrected comment in `index.css` from Step 1 (it was already inconsistent with `index.css` before this change — fix it while touching the same rule).

- [ ] **Step 3: Run the full test suite**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 4: Manual visual check**

Confirm cards/panels/buttons look correct (slightly softer corners) on the pages checked in Task 1.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/index.css frontend/src/components/ui/button.tsx
git commit -m "feat(frontend): soften radius scale, add primary glow shadow token"
```

---

### Task 4: Add the Fraunces display font

**Files:**
- Modify: `frontend/package.json` (new dependency)
- Modify: `frontend/src/index.css:1-3,46-64` (font import, `--font-display` token, apply it to the display/title text bands)

**Interfaces:**
- Produces: `--font-display` theme token (and the auto-generated `font-display` Tailwind utility class, unused directly — applied via the selector rule below instead so every current and future `text-display`/`text-title` usage picks it up without touching 17 call-site files).

- [ ] **Step 1: Install the font package**

Run: `cd frontend && npm install @fontsource-variable/fraunces`

- [ ] **Step 2: Import it and add the token**

In `frontend/src/index.css`, add the import alongside the existing font imports:

```css
@import "@fontsource-variable/inter";
@import "@fontsource-variable/jetbrains-mono";
@import "@fontsource-variable/fraunces";
@import "tailwindcss";
```

Then add the token next to `--font-sans`/`--font-mono`:

```css
  --font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono Variable", ui-monospace, "SFMono-Regular", monospace;
  --font-display: "Fraunces Variable", ui-serif, Georgia, serif;
```

- [ ] **Step 3: Apply it to the display/title text bands**

In the `@layer base` block at the bottom of `frontend/src/index.css`, add a rule targeting the two existing utility classes (Tailwind auto-generates `.text-display`/`.text-title` from the `--text-display`/`--text-title` tokens already in the theme, so this one rule covers every current and future heading using them):

```css
  .text-display,
  .text-title {
    font-family: var(--font-display);
  }
```

Add it right after the existing `:focus-visible` rule, before the `prefers-reduced-motion` block (which Task 5 removes).

- [ ] **Step 4: Run the full test suite**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 5: Manual visual check**

Confirm every page's `h1`/`h2`-scale headings (landing hero, page titles like `PageHeader`, admin page titles) now render in the serif Fraunces face, while body text, buttons, and form labels stay in Inter.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/index.css
git commit -m "feat(frontend): add Fraunces display font for headings"
```

---

### Task 5: Remove `prefers-reduced-motion` support app-wide

**Files:**
- Delete: `frontend/src/hooks/use-reduced-motion.ts`
- Delete: `frontend/src/hooks/use-reduced-motion.test.tsx`
- Modify: `frontend/src/components/motion/Reveal.tsx`
- Modify: `frontend/src/components/motion/Parallax.tsx`
- Modify: `frontend/src/components/motion/Stagger.tsx`
- Modify: `frontend/src/components/motion/ScrollProgress.tsx`
- Modify: `frontend/src/components/motion/PageTransition.tsx`
- Modify: `frontend/src/index.css` (remove the `prefers-reduced-motion` media query)

**Interfaces:**
- Consumes: nothing (this only removes a conditional branch from existing components).
- Produces: `Reveal`, `Stagger`/`StaggerItem`, `Parallax`, `ScrollProgress`, `PageTransition` keep their existing exported names/props — only their internal reduced-motion branch is deleted, so nothing downstream needs a signature change.

- [ ] **Step 1: Delete the hook and its test**

```bash
rm frontend/src/hooks/use-reduced-motion.ts frontend/src/hooks/use-reduced-motion.test.tsx
```

- [ ] **Step 2: Strip the reduced-motion branch from each motion primitive**

`frontend/src/components/motion/Reveal.tsx` becomes:

```tsx
import { motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";

type RevealProps = Omit<HTMLMotionProps<"div">, "children"> & { children?: ReactNode };

export function Reveal({ children, ...props }: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
```

`frontend/src/components/motion/Parallax.tsx` becomes:

```tsx
import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

type ParallaxProps = {
  children: ReactNode;
  strength?: number;
  className?: string;
};

export function Parallax({ children, strength = 32, className }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [strength, -strength]);

  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  );
}
```

`frontend/src/components/motion/Stagger.tsx` becomes:

```tsx
import { motion, type HTMLMotionProps, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

type StaggerProps = Omit<HTMLMotionProps<"div">, "children"> & { children?: ReactNode };

export function Stagger({ children, ...props }: StaggerProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      variants={containerVariants}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, ...props }: StaggerProps) {
  return (
    <motion.div variants={itemVariants} {...props}>
      {children}
    </motion.div>
  );
}
```

`frontend/src/components/motion/ScrollProgress.tsx` becomes:

```tsx
import { useEffect, useState } from "react";
import { motion, useScroll, useSpring } from "framer-motion";

// A thin, page-wide progress cue — the one piece of "whole app" scroll
// interactivity that doesn't cost anything on dense/functional pages.
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 280, damping: 32, mass: 0.3 });
  const [canScroll, setCanScroll] = useState(false);

  useEffect(() => {
    const check = () => setCanScroll(document.documentElement.scrollHeight > window.innerHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(document.documentElement);
    window.addEventListener("resize", check);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", check);
    };
  }, []);

  if (!canScroll) return null;

  return (
    <motion.div
      className="pointer-events-none fixed inset-x-0 top-0 z-40 h-0.5 origin-left bg-primary"
      style={{ scaleX }}
      aria-hidden="true"
    />
  );
}
```

`frontend/src/components/motion/PageTransition.tsx` becomes:

```tsx
import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode } from "react";
import { useLocation } from "react-router-dom";

export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: Remove the CSS media query**

In `frontend/src/index.css`, delete this whole block from `@layer base`:

```css
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
```

- [ ] **Step 4: Run the full test suite**

Run: `cd frontend && npm test`
Expected: PASS — `motion.test.tsx` only checks that children render, which is unaffected.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src
git commit -m "feat(frontend): remove prefers-reduced-motion support app-wide"
```

---

### Task 6: `AnimatedNumber` count-up component, wired into `StatsStrip`

**Files:**
- Create: `frontend/src/components/landing/AnimatedNumber.tsx`
- Create: `frontend/src/components/landing/AnimatedNumber.test.tsx`
- Modify: `frontend/src/components/landing/StatsStrip.tsx:28`

**Interfaces:**
- Produces: `AnimatedNumber({ value: number; duration?: number })` — renders a `<span>` that counts from 0 up to `value` over `duration` ms (default 900), formatted with `toLocaleString()`.
- Consumes (in `StatsStrip.tsx`): the existing `stats?.[item.key]` numeric value, only once loaded (loading/error states keep rendering the existing "—" placeholder — `AnimatedNumber` is never given `undefined`).

Implementation note: the spec described gating the count-up on scroll-into-view via an intersection observer. `StatsStrip`'s whole row is already wrapped in `<Reveal>`, which itself only fades in once scrolled into view — so in practice the numbers are invisible until that happens regardless of when the count-up timer starts. Gating `AnimatedNumber` on a *second*, independent intersection observer would only test against a real IntersectionObserver, which the test setup stubs as a no-op that never fires (see `frontend/src/test/setup.ts`) — making the animation untestable. Starting the count on mount/value-change instead achieves the same visible effect with a deterministic, testable implementation.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/landing/AnimatedNumber.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedNumber } from "@/components/landing/AnimatedNumber";

describe("AnimatedNumber", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at 0", () => {
    render(<AnimatedNumber value={128} duration={200} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("counts up to the target value once the duration elapses", () => {
    render(<AnimatedNumber value={128} duration={200} />);

    vi.advanceTimersByTime(200);

    expect(screen.getByText("128")).toBeInTheDocument();
  });

  it("formats large values with locale separators", () => {
    render(<AnimatedNumber value={12450} duration={100} />);

    vi.advanceTimersByTime(100);

    expect(screen.getByText("12,450")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/components/landing/AnimatedNumber.test.tsx`
Expected: FAIL with "Cannot find module '@/components/landing/AnimatedNumber'" (or similar — the file doesn't exist yet).

- [ ] **Step 3: Implement `AnimatedNumber`**

Create `frontend/src/components/landing/AnimatedNumber.tsx`:

```tsx
import { useEffect, useState } from "react";

type AnimatedNumberProps = {
  value: number;
  duration?: number;
};

const STEP_MS = 16;

export function AnimatedNumber({ value, duration = 900 }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    setDisplay(0);
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setDisplay(Math.round(progress * value));
      if (progress >= 1) clearInterval(interval);
    }, STEP_MS);

    return () => clearInterval(interval);
  }, [value, duration]);

  return <span>{display.toLocaleString()}</span>;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/landing/AnimatedNumber.test.tsx`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Wire it into `StatsStrip`**

In `frontend/src/components/landing/StatsStrip.tsx`, add the import:

```tsx
import { AnimatedNumber } from "@/components/landing/AnimatedNumber";
```

and replace line 28:

```tsx
              {isLoading ? "—" : isError ? "—" : stats?.[item.key]}
```

with:

```tsx
              {isLoading || isError || stats == null ? (
                "—"
              ) : (
                <AnimatedNumber value={stats[item.key]} />
              )}
```

- [ ] **Step 6: Run the full test suite**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/landing/AnimatedNumber.tsx frontend/src/components/landing/AnimatedNumber.test.tsx frontend/src/components/landing/StatsStrip.tsx
git commit -m "feat(frontend): animate StatsStrip numbers with a count-up"
```

---

### Task 7: `CursorGlow` hero component

**Files:**
- Create: `frontend/src/components/landing/CursorGlow.tsx`
- Create: `frontend/src/components/landing/CursorGlow.test.tsx`
- Modify: `frontend/src/routes/LandingPage.tsx` (wrap the hero section)

**Interfaces:**
- Produces: `CursorGlow({ children: ReactNode; className?: string })` — a wrapper `div` that renders its children plus an absolutely-positioned decorative gradient layer that follows the pointer within the wrapper's bounds.
- Consumes (in `LandingPage.tsx`): wraps the existing hero `<section>` element (the one currently at `frontend/src/routes/LandingPage.tsx:22`).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/landing/CursorGlow.test.tsx`:

```tsx
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CursorGlow } from "@/components/landing/CursorGlow";

function stubRect(element: HTMLElement) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 100,
    right: 200,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON: () => {},
  } as DOMRect);
}

describe("CursorGlow", () => {
  it("renders its children", () => {
    const { getByText } = render(
      <CursorGlow>
        <p>hero content</p>
      </CursorGlow>
    );
    expect(getByText("hero content")).toBeInTheDocument();
  });

  it("defaults the glow to the wrapper's center", () => {
    const { container } = render(
      <CursorGlow>
        <p>hero content</p>
      </CursorGlow>
    );
    const glow = container.querySelector("[data-glow]") as HTMLElement;
    expect(glow.style.getPropertyValue("--glow-x")).toBe("50%");
    expect(glow.style.getPropertyValue("--glow-y")).toBe("50%");
  });

  it("moves the glow to follow the pointer", () => {
    const { container } = render(
      <CursorGlow>
        <p>hero content</p>
      </CursorGlow>
    );
    const wrapper = container.firstChild as HTMLElement;
    stubRect(wrapper);

    fireEvent.pointerMove(wrapper, { clientX: 150, clientY: 25 });

    const glow = container.querySelector("[data-glow]") as HTMLElement;
    expect(glow.style.getPropertyValue("--glow-x")).toBe("75%");
    expect(glow.style.getPropertyValue("--glow-y")).toBe("25%");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/components/landing/CursorGlow.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `CursorGlow`**

Create `frontend/src/components/landing/CursorGlow.tsx`:

```tsx
import { useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type CursorGlowProps = {
  children: ReactNode;
  className?: string;
};

export function CursorGlow({ children, className }: CursorGlowProps) {
  const [position, setPosition] = useState({ x: 50, y: 50 });

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
  }

  return (
    <div className={cn("relative", className)} onPointerMove={handlePointerMove}>
      <div
        data-glow
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={
          {
            backgroundImage:
              "radial-gradient(480px circle at var(--glow-x) var(--glow-y), color-mix(in srgb, var(--color-primary) 18%, transparent), transparent 70%)",
            "--glow-x": `${position.x}%`,
            "--glow-y": `${position.y}%`,
          } as CSSProperties
        }
      />
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/landing/CursorGlow.test.tsx`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Wrap the hero section in `LandingPage.tsx`**

In `frontend/src/routes/LandingPage.tsx`, add the import:

```tsx
import { CursorGlow } from "@/components/landing/CursorGlow";
```

Then wrap the existing hero `<section>` (currently `<section className="grid min-w-0 grid-cols-1 items-center gap-12 pt-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8">…</section>`) with `<CursorGlow>`:

```tsx
      <CursorGlow className="grid min-w-0 grid-cols-1 items-center gap-12 pt-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8">
        <div className="flex min-w-0 flex-col items-start gap-6 text-left">
          {/* ...unchanged hero content... */}
        </div>

        <Reveal className="flex min-w-0 justify-center pt-8 pr-6 pl-10 sm:pr-10 lg:justify-end lg:pt-0">
          <Parallax strength={24}>
            <PreviewCard />
          </Parallax>
        </Reveal>
      </CursorGlow>
```

(Move the `className` that was on the `<section>` onto `CursorGlow`, and drop the now-redundant `<section>` tag — `CursorGlow` renders a `div` in its place. All inner content is unchanged.)

- [ ] **Step 6: Run the full test suite**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 7: Manual visual check**

On the dev server, load `/` and move the mouse across the hero — confirm a soft gold glow follows the pointer.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/landing/CursorGlow.tsx frontend/src/components/landing/CursorGlow.test.tsx frontend/src/routes/LandingPage.tsx
git commit -m "feat(frontend): add cursor-reactive glow to the landing hero"
```

---

### Task 8: `Tilt` hover primitive, wired into `PreviewCard` and the primary CTAs

**Files:**
- Create: `frontend/src/components/motion/Tilt.tsx`
- Create: `frontend/src/components/motion/Tilt.test.tsx`
- Modify: `frontend/src/components/landing/PreviewCard.tsx`
- Modify: `frontend/src/routes/LandingPage.tsx` (the two "Get started" CTA buttons)

**Interfaces:**
- Produces: `Tilt({ children, strength?: number, ...restMotionDivProps })` — a wrapper that applies a pointer-following perspective rotation on hover (desktop pointer events only) and eases back to flat on pointer-leave. Forwards any other `motion.div` prop (`className`, `aria-hidden`, etc.), same pattern as the existing `Reveal`/`Stagger` primitives. Lives alongside the other motion primitives since it's app-generic, not landing-specific.
- Consumes (`PreviewCard.tsx`): replaces the card's hardcoded `style={{ transform: "rotateY(-5deg) rotateX(1.5deg)" }}` with `Tilt`'s dynamic transform.
- Consumes (`LandingPage.tsx`): wraps the hero and closing-CTA "Get started" `<Button asChild>` elements.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/motion/Tilt.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Tilt } from "@/components/motion/Tilt";

function stubRect(element: HTMLElement) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 100,
    right: 200,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON: () => {},
  } as DOMRect);
}

describe("Tilt", () => {
  it("renders its children", () => {
    render(
      <Tilt>
        <p>card content</p>
      </Tilt>
    );
    expect(screen.getByText("card content")).toBeInTheDocument();
  });

  it("does not throw on pointer move and pointer leave", () => {
    const { container } = render(
      <Tilt>
        <p>card content</p>
      </Tilt>
    );
    const wrapper = container.firstChild as HTMLElement;
    stubRect(wrapper);

    expect(() => {
      fireEvent.pointerMove(wrapper, { clientX: 150, clientY: 25 });
      fireEvent.pointerLeave(wrapper);
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/components/motion/Tilt.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Tilt`**

Create `frontend/src/components/motion/Tilt.tsx`:

```tsx
import { type HTMLMotionProps, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import type { PointerEvent, ReactNode } from "react";

type TiltProps = Omit<
  HTMLMotionProps<"div">,
  "children" | "style" | "onPointerMove" | "onPointerLeave"
> & {
  children?: ReactNode;
  strength?: number;
};

export function Tilt({ children, strength = 8, ...props }: TiltProps) {
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const springConfig = { stiffness: 300, damping: 30 };
  const rotateX = useSpring(useTransform(py, [0, 1], [strength, -strength]), springConfig);
  const rotateY = useSpring(useTransform(px, [0, 1], [-strength, strength]), springConfig);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width);
    py.set((event.clientY - rect.top) / rect.height);
  }

  function handlePointerLeave() {
    px.set(0.5);
    py.set(0.5);
  }

  return (
    <motion.div
      style={{ perspective: "var(--perspective-hero)", rotateX, rotateY }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      {...props}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/motion/Tilt.test.tsx`
Expected: PASS (both tests)

- [ ] **Step 5: Wire it into `PreviewCard`**

In `frontend/src/components/landing/PreviewCard.tsx`, add the import:

```tsx
import { Tilt } from "@/components/motion/Tilt";
```

Replace the outer wrapper (currently `<div className="relative my-8 w-full max-w-sm sm:my-10" style={{ perspective: "var(--perspective-hero)" }} aria-hidden="true">`) so `Tilt` supplies the perspective/rotation instead of a static one:

```tsx
    <Tilt
      strength={6}
      className="relative my-8 w-full max-w-sm sm:my-10"
    >
```

(closing tag becomes `</Tilt>` instead of `</div>`; keep `aria-hidden="true"` on it), and remove the hardcoded `style={{ transform: "rotateY(-5deg) rotateX(1.5deg)" }}` from the inner card `div` (currently the `rounded-panel border border-border bg-surface shadow-hero` div) — `Tilt` now owns the rotation for the whole component, so that inner div loses its `style` prop entirely.

- [ ] **Step 6: Wire it into the two primary CTA buttons in `LandingPage.tsx`**

In `frontend/src/routes/LandingPage.tsx`, add the import:

```tsx
import { Tilt } from "@/components/motion/Tilt";
```

Wrap both `<Button asChild size="lg" className="group"><Link to="/register">Get started...</Link></Button>` instances (the hero one and the closing-CTA one) with `<Tilt strength={4} className="inline-block">…</Tilt>`, e.g. the hero CTA becomes:

```tsx
            <Tilt strength={4} className="inline-block">
              <Button asChild size="lg" className="group">
                <Link to="/register">
                  Get started
                  <ArrowRight
                    className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </Link>
              </Button>
            </Tilt>
```

Apply the same wrapping to the closing-CTA "Get started" button at the bottom of the file.

- [ ] **Step 7: Run the full test suite**

Run: `cd frontend && npm test`
Expected: PASS — `landing-page.test.tsx` finds the "Get started" link by role/name regardless of the extra wrapper `div`.

- [ ] **Step 8: Manual visual check**

On the dev server, hover the preview card and both "Get started" buttons — confirm a subtle 3D tilt follows the pointer and resets on mouse-leave.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/motion/Tilt.tsx frontend/src/components/motion/Tilt.test.tsx frontend/src/components/landing/PreviewCard.tsx frontend/src/routes/LandingPage.tsx
git commit -m "feat(frontend): add hover-tilt to the preview card and primary CTAs"
```

---

### Task 9: Sticky-scroll `ProductShowcase`

**Files:**
- Modify: `frontend/src/components/landing/ProductShowcase.tsx`
- Create: `frontend/src/components/landing/product-showcase.test.tsx`

**Interfaces:**
- Produces: `ProductShowcase()` — same exported name/no-props signature as before; internal structure changes from a single card to a two-column sticky layout on `lg+` (falls back to stacked on narrower viewports).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/landing/product-showcase.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductShowcase } from "@/components/landing/ProductShowcase";

describe("ProductShowcase", () => {
  it("renders the heading and all three callouts", () => {
    render(<ProductShowcase />);

    expect(
      screen.getByRole("heading", { name: /everything organized around your syllabus/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/pick your program/i)).toBeInTheDocument();
    expect(screen.getByText(/every note is reviewed/i)).toBeInTheDocument();
    expect(screen.getByText(/download it, or upload your own/i)).toBeInTheDocument();
  });

  it("pins the visual column on large viewports", () => {
    const { container } = render(<ProductShowcase />);
    expect(container.querySelector(".lg\\:sticky")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/components/landing/product-showcase.test.tsx`
Expected: FAIL — current markup has no `lg:sticky` element and no callout copy matching those strings.

- [ ] **Step 3: Restructure `ProductShowcase`**

Replace `frontend/src/components/landing/ProductShowcase.tsx` with:

```tsx
import { ChevronRight, FileText } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";
import { StatusPill } from "@/components/layout/StatusPill";

// Mirrors the real taxonomy (Program -> Branch -> Subject, with `semester` as
// a field on Subject — see frontend/src/lib/api-types.ts) rather than a made
// up hierarchy. Values are representative labels, not a live query — the
// real path requires an account (router.tsx: /browse, /subjects/:id).
const LEVELS = [
  { label: "Program", value: "B.Tech" },
  { label: "Branch", value: "CSE" },
  { label: "Semester", value: "3" },
  { label: "Subject", value: "Data Structures" },
];

const NOTES = [
  { title: "Data Structures — Unit 1", type: "Lecture notes" },
  { title: "Data Structures — Unit 3", type: "Lecture notes" },
  { title: "Sem 3 PYQs — 2024", type: "PYQ" },
];

const CALLOUTS = [
  {
    title: "Filter down in seconds",
    body: "Pick your program, branch, semester, and subject — the same path every time, not a fresh search each visit.",
  },
  {
    title: "Trust what you find",
    body: "Every note is reviewed before it reaches the library, so you're never stuck guessing if a PDF is even the right one.",
  },
  {
    title: "Keep the loop going",
    body: "Download it, or upload your own — the next student searching this subject finds it the same way you did.",
  },
] as const;

function ShowcaseCard() {
  return (
    <div className="flex flex-col gap-6 rounded-panel border border-border bg-surface p-6 lg:flex-row lg:items-stretch lg:gap-0 lg:divide-x lg:divide-border">
      <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:flex-nowrap lg:items-start lg:justify-center lg:gap-3 lg:pr-6">
        {LEVELS.map((level, index) => (
          <div key={level.label} className="flex items-center gap-2 lg:contents">
            <div className="flex flex-col gap-0.5 rounded-card border border-border bg-background px-3 py-2">
              <span className="text-caption text-text-tertiary">{level.label}</span>
              <span className="text-ui font-medium text-text-primary">{level.value}</span>
            </div>
            {index < LEVELS.length - 1 && (
              <ChevronRight
                className="size-3.5 shrink-0 text-text-tertiary lg:hidden"
                strokeWidth={2}
                aria-hidden="true"
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 lg:pl-6">
        <span className="px-1 text-caption font-medium text-text-tertiary">Notes</span>
        <ul className="flex flex-col divide-y divide-border">
          {NOTES.map((note) => (
            <li key={note.title} className="flex items-center gap-3 px-1 py-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground">
                <FileText className="size-3.5" strokeWidth={2} aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-ui font-medium text-text-primary">{note.title}</span>
                <span className="truncate text-caption text-text-muted">{note.type}</span>
              </span>
              <StatusPill status="approved" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ProductShowcase() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex max-w-lg flex-col gap-2">
        <h2 className="text-title font-semibold tracking-tight text-text-primary">
          Everything organized around your syllabus.
        </h2>
        <p className="text-ui text-text-muted">
          No folder-hunting. Pick your program, narrow to your subject, and the right notes are
          already there.
        </p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-16">
        <div className="lg:sticky lg:top-24">
          <Reveal>
            <ShowcaseCard />
          </Reveal>
        </div>

        <div className="flex flex-col gap-8">
          {CALLOUTS.map((callout, index) => (
            <Reveal
              key={callout.title}
              transition={{ duration: 0.4, ease: "easeOut", delay: index * 0.08 }}
              className="flex flex-col gap-2 border-l-2 border-border pl-5"
            >
              <h3 className="text-ui font-semibold text-text-primary">{callout.title}</h3>
              <p className="text-ui text-text-muted">{callout.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/landing/product-showcase.test.tsx`
Expected: PASS (both tests)

- [ ] **Step 5: Run the full test suite**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 6: Manual visual check**

On the dev server, scroll through the "Everything organized around your syllabus" section on a wide viewport — confirm the taxonomy card stays pinned while the three callouts scroll past beside it, and that it falls back to a normal stacked layout on a narrow/mobile viewport.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/landing/ProductShowcase.tsx frontend/src/components/landing/product-showcase.test.tsx
git commit -m "feat(frontend): make ProductShowcase a sticky-scroll section"
```

---

### Task 10: Copy pass — `ProblemSection`, `HowItWorks`, `Features`, closing CTA

**Files:**
- Modify: `frontend/src/components/landing/ProblemSection.tsx:22-26`
- Modify: `frontend/src/components/landing/HowItWorks.tsx:9-22`
- Modify: `frontend/src/components/landing/Features.tsx:6-27`
- Modify: `frontend/src/routes/LandingPage.tsx:32-35,86-90` (hero subhead + closing CTA body)

**Interfaces:**
- No signature changes anywhere in this task — every component keeps the same name/props/exports. Only string literals change. Every heading and every string the test suite (`landing-page.test.tsx`) asserts on is left untouched: the hero `<h1>` text, both "Get started"/"Log in" link labels and hrefs, and the four `Features` card titles ("Browse by course", "Community reviewed", "Search instantly", "Give back").

- [ ] **Step 1: Tighten the hero subhead**

In `frontend/src/routes/LandingPage.tsx`, replace:

```tsx
          <p className="max-w-lg text-lead text-text-muted">
            Find course notes shared by students in your program, branch, and semester —
            organized, searchable, and reviewed before they reach the library.
          </p>
```

with:

```tsx
          <p className="max-w-lg text-lead text-text-muted">
            Every semester, the same notes get retyped, re-photographed, and re-lost in five
            different WhatsApp groups. Yours don&rsquo;t have to.
          </p>
```

- [ ] **Step 2: Sharpen the `ProblemSection` body copy**

In `frontend/src/components/landing/ProblemSection.tsx`, replace:

```tsx
        <p className="text-ui text-text-muted">
          WhatsApp groups. Google Drive folders. Telegram chats. Screenshots. Random PDFs. By exam
          week, nobody remembers where the good notes went — or whether that link still works.
        </p>
```

with:

```tsx
        <p className="text-ui text-text-muted">
          WhatsApp groups. Google Drive links that expire. Screenshots you can&rsquo;t search. By
          exam week, nobody remembers which PDF is the final syllabus version — or whether the
          link even still works.
        </p>
```

(Heading above it, `Your notes shouldn't live in five different places.`, is unchanged.)

- [ ] **Step 3: Reframe `HowItWorks` step bodies around outcomes**

In `frontend/src/components/landing/HowItWorks.tsx`, replace the `STEPS` array's `body` values:

```tsx
const STEPS = [
  {
    number: "01",
    icon: BookOpen,
    title: "Choose your course",
    body: "Find your exact course in three taps, not three group chats.",
  },
  {
    number: "02",
    icon: ShieldCheck,
    title: "Open trusted notes",
    body: "Every note is reviewed before it reaches you — no dead links, no wrong-subject uploads.",
  },
  {
    number: "03",
    icon: UploadCloud,
    title: "Study or share",
    body: "Download instantly, or upload the notes that got you through the exam.",
  },
] as const;
```

(`title` values are unchanged — only `body` changes.)

- [ ] **Step 4: Tighten `Features` body copy**

In `frontend/src/components/landing/Features.tsx`, replace the `FEATURES` array's `body` values:

```tsx
const FEATURES = [
  {
    icon: LayoutGrid,
    title: "Browse by course",
    body: "Filter by program, branch, semester, and subject — not endless scrolling.",
  },
  {
    icon: ShieldCheck,
    title: "Community reviewed",
    body: "Every upload is checked before it reaches the library.",
  },
  {
    icon: Search,
    title: "Search instantly",
    body: "Type a subject or topic and skip the old chat threads entirely.",
  },
  {
    icon: UploadIcon,
    title: "Give back",
    body: "Upload the notes that helped you, and help the next student too.",
  },
] as const;
```

(`title` values are unchanged — these are exactly what `landing-page.test.tsx` asserts on.)

- [ ] **Step 5: Mirror the hero's framing in the closing CTA**

In `frontend/src/routes/LandingPage.tsx`, replace:

```tsx
          <p className="max-w-md text-ui text-text-muted">
            Find the notes your course needs — or upload the ones that helped you.
          </p>
```

with:

```tsx
          <p className="max-w-md text-ui text-text-muted">
            Stop hunting through five chats for the right PDF. Find it here — or upload the one
            you already have.
          </p>
```

(Heading above it, `Your next study session starts here.`, is unchanged.)

- [ ] **Step 6: Run the full test suite**

Run: `cd frontend && npm test`
Expected: PASS — no test asserts on any of the strings changed in this task.

- [ ] **Step 7: Manual visual check**

Read through the landing page top to bottom on the dev server and confirm the copy reads as one consistent arc (pain point in the hero → named failure modes in `ProblemSection` → outcome-framed steps/callouts → closing CTA that echoes the hero).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/routes/LandingPage.tsx frontend/src/components/landing/ProblemSection.tsx frontend/src/components/landing/HowItWorks.tsx frontend/src/components/landing/Features.tsx
git commit -m "feat(frontend): rewrite landing page copy for a tighter narrative arc"
```

---

### Task 11: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd frontend && npm test`
Expected: PASS, all suites.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual cross-page visual check, both themes**

Run: `cd frontend && npm run dev`. For each of: landing page (`/`), login, register, signed-in dashboard (`/home`), a notes list/detail view, the upload flow, the moderation queue, and one admin table page — check both dark mode (default) and light mode (via the theme toggle). Confirm: no leftover indigo/violet anywhere, text stays legible in both modes, status pills (pending/approved/rejected) are visually distinct from each other and from the primary accent, and headings render in the Fraunces serif face while body/UI text stays Inter.

- [ ] **Step 5: Commit (only if Steps 2–4 required fixes)**

If typecheck, lint, or the visual check turned up anything to fix, commit those fixes now:

```bash
git add -A frontend/src
git commit -m "fix(frontend): address issues found in Ink & Amber final verification pass"
```

If nothing needed fixing, skip this step — there's nothing to commit.
