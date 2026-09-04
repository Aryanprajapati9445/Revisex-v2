# Frontend Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing revisex-v2 frontend off Notion's specific visual DNA onto an original, dark-first "sleek & technical" design system, centralize motion via Framer Motion, add a command palette, and add a public landing page (none exists today) with the existing data-driven `HomePage` relocated behind auth.

**Architecture:** Token-driven restyle (change `@theme` custom properties once, semantic classes cascade everywhere) + a small set of reusable Framer Motion primitives (`PageTransition`, `Reveal`, `Stagger`/`StaggerItem`) applied page-by-page + a new public `LandingPage` route with `HomePage` moved to a protected `/home` route.

**Tech Stack:** React 19 + Vite + TypeScript, React Router 7, TanStack Query, Tailwind CSS v4 (CSS-first `@theme`), shadcn/ui on Radix primitives, adding `framer-motion` and `cmdk`.

**Spec:** `docs/superpowers/specs/2026-09-04-visual-redesign-design.md`

## Global Constraints

- New dependencies, exact packages: `framer-motion`, `cmdk`, `@fontsource-variable/jetbrains-mono`. No other new runtime dependencies.
- Color tokens (dark, primary mode): background `#0B0D10`, surface `#14171B`, surface-elevated `#1B1F24`, border `#262B31`, text-primary `#E8EAED`, text-secondary `#9AA1AC`, accent `#6E56CF`. Light tokens: background `#F7F7F8`, surface `#FFFFFF`, surface-elevated `#F0F1F3`, border `#E2E4E8`, text-primary `#14171B`, text-secondary `#5B6270`, accent `#6E56CF` (same in both modes).
- Accent (`#6E56CF`) is used only for interactive/active states — never decoration.
- Card/control/panel radius moves to a sharper 4-6px scale (down from the current 8-12px).
- No changes to TanStack Query hooks, route param logic, form validation, the API client, or auth/session handling — this is a rendering/interaction-layer change only.
- `HomePage`'s own internals, data-fetching, and features are NOT to be changed — only its route (`/` → `/home`) and auth-gating.
- All non-essential motion (page slides, stagger delays, tap scale) must respect `prefers-reduced-motion` via a shared `useReducedMotion` hook.
- Existing public browse routes (`/browse`, `/programs/:programId`, `/branches/:branchId`, `/subjects/:subjectId`, `/notes/:noteId`) stay anonymous-accessible, unchanged.
- No visual regression tooling is added in this pass.

---

## File Structure

New files:
- `frontend/src/app/ThemeProvider.tsx` — dark/light theme context + `localStorage` persistence.
- `frontend/src/hooks/use-reduced-motion.ts` — thin wrapper over Framer Motion's `useReducedMotion`.
- `frontend/src/components/motion/PageTransition.tsx` — route-change fade/slide wrapper.
- `frontend/src/components/motion/Reveal.tsx` — scroll-into-view fade/slide wrapper.
- `frontend/src/components/motion/Stagger.tsx` — `Stagger` container + `StaggerItem` child.
- `frontend/src/components/motion/overlay-variants.ts` — shared Framer variants for Dialog/AlertDialog/DropdownMenu.
- `frontend/src/components/command-palette/CommandPalette.tsx` — `cmdk`-based quick nav/search.
- `frontend/src/hooks/use-command-palette.ts` — `Ctrl/Cmd+K` shortcut + open state.
- `frontend/src/routes/LandingPage.tsx` — new public landing page.
- `frontend/src/routes/landing-page.test.tsx` — landing page tests.

Modified files (by task, see below):
- `frontend/src/index.css` (tokens)
- `frontend/src/app/providers.tsx` (ThemeProvider wiring)
- `frontend/src/components/layout/AppShell.tsx` (PageTransition + CommandPalette wiring)
- `frontend/src/components/layout/TopNav.tsx` (theme toggle button)
- `frontend/src/components/ui/dialog.tsx`, `alert-dialog.tsx`, `dropdown-menu.tsx` (Framer-driven open/close)
- `frontend/src/app/router.tsx` (landing route, `/home` protection)
- `frontend/src/routes/LoginPage.tsx`, `RegisterPage.tsx` (redirect target)
- `frontend/src/routes/HomePage.tsx`, `SearchPage.tsx`, `SubjectNotesPage.tsx` (Stagger on lists)
- `frontend/src/routes/NoteDetailPage.tsx`, `SubjectsPage.tsx`, `BranchesPage.tsx`, `ProgramsPage.tsx`, `UploadPage.tsx`, `MyUploadsPage.tsx`, `SettingsPage.tsx`, `ModerationPage.tsx`, `UsersPage.tsx`, `admin/AdminUsersPage.tsx`, `admin/RolesPage.tsx`, `admin/AuditLogPage.tsx` (Reveal wrap)
- `frontend/src/test/setup.ts` (IntersectionObserver stub)
- `frontend/src/app/router.test.tsx`, `frontend/src/routes/home-page.test.tsx` (route location updates)
- `frontend/package.json` (new deps)

---

### Task 1: Install dependencies

**Files:**
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `framer-motion`, `cmdk`, `@fontsource-variable/jetbrains-mono` importable from any frontend file.

- [ ] **Step 1: Install packages**

Run:
```bash
cd frontend
npm install framer-motion cmdk
npm install @fontsource-variable/jetbrains-mono
```

- [ ] **Step 2: Verify install**

Run: `cd frontend && npm run typecheck`
Expected: passes with no new errors (packages installed but unused yet).

- [ ] **Step 3: Commit**

```bash
cd frontend
git add package.json package-lock.json
git commit -m "chore(frontend): add framer-motion, cmdk, jetbrains mono"
```

---

### Task 2: Rewrite design tokens (dark-first + light mode)

**Files:**
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces: all existing `bg-background`, `bg-surface`, `text-text-primary`, `text-text-muted`, `bg-accent`, `bg-primary`, `rounded-panel`/`rounded-card`/`rounded-control`, `--font-mono` Tailwind utilities, now resolving to the new dark-first palette; `:root[data-theme="light"]` override block for the secondary light theme.

- [ ] **Step 1: Replace the color/radius tokens in the `@theme` block**

Edit `frontend/src/index.css`, replacing the whole `@theme { ... }` block content (keep the `@import` lines and `@layer base` block as-is for now — later steps touch those) with:

```css
@import "@fontsource-variable/inter";
@import "@fontsource-variable/jetbrains-mono";
@import "tailwindcss";

@theme {
  /* Surfaces — dark-first, sleek/technical neutral scale */
  --color-background: #0b0d10;
  --color-surface: #14171b;
  --color-surface-elevated: #1b1f24;
  --color-border: #262b31;

  /* Text */
  --color-text-primary: #e8eaed;
  --color-text-muted: #9aa1ac;
  --color-text-tertiary: #6b7280;

  /* Brand — the ONE accent, interactive states only. */
  --color-primary: #6e56cf;
  --color-primary-foreground: #ffffff;
  --color-accent: #23273a;
  --color-accent-foreground: #a996f0;

  /* Status pills — retoned to sit on the dark surface above. */
  --color-status-pending-bg: #33291a;
  --color-status-pending-fg: #e9b949;
  --color-status-approved-bg: #163024;
  --color-status-approved-fg: #4ade80;
  --color-status-rejected-bg: #331e1e;
  --color-status-rejected-fg: #f87171;

  /* Radius — sharper nesting rule: 8 outer -> 6 default -> 4 inner */
  --radius-panel: 8px;
  --radius-card: 6px;
  --radius-control: 4px;

  /* Depth — minimal shadows; border + surface-elevated carry most separation
     now that this is a dark theme (heavy shadows don't read on dark bg). */
  --shadow-raised: 0 1px 2px rgba(0, 0, 0, 0.4), 0 0 0 1px var(--color-border);
  --shadow-floating: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--color-border);

  --font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono Variable", ui-monospace, "SFMono-Regular", monospace;

  /* Display band */
  --text-display: 54px;
  --text-display--line-height: 56px;
  --text-display--letter-spacing: -1.875px;
  --text-title: 42px;
  --text-title--line-height: 46px;
  --text-title--letter-spacing: -1.2px;

  /* UI band — 14px/500 is the default */
  --text-lead: 20px;
  --text-lead--line-height: 28px;
  --text-base: 16px;
  --text-ui: 14px;
  --text-ui--line-height: 20px;
  --text-caption: 12px;
  --text-caption--line-height: 16px;

  /* --- shadcn/ui bridge -----------------------------------------------
     shadcn's generated components read these specific token names. */
  --color-foreground: var(--color-text-primary);
  --color-card: var(--color-surface);
  --color-card-foreground: var(--color-text-primary);
  --color-popover: var(--color-surface-elevated);
  --color-popover-foreground: var(--color-text-primary);
  --color-secondary: var(--color-surface);
  --color-secondary-foreground: var(--color-text-primary);
  --color-muted: var(--color-surface);
  --color-muted-foreground: var(--color-text-muted);
  --color-destructive: var(--color-status-rejected-fg);
  --color-destructive-foreground: #ffffff;
  --color-input: var(--color-surface);
  --color-ring: var(--color-primary);

  --radius: var(--radius-card);
  --radius-sm: var(--radius-control);
  --radius-md: var(--radius-control);
  --radius-lg: var(--radius-card);
  --radius-xl: var(--radius-panel);
}

/* Secondary light theme — same token names, inverted values. Opt in via
   `data-theme="light"` on <html>, set by ThemeProvider (Task 3). */
:root[data-theme="light"] {
  --color-background: #f7f7f8;
  --color-surface: #ffffff;
  --color-surface-elevated: #f0f1f3;
  --color-border: #e2e4e8;

  --color-text-primary: #14171b;
  --color-text-muted: #5b6270;
  --color-text-tertiary: #8b93a1;

  --color-accent: #ede9fe;
  --color-accent-foreground: #6e56cf;

  --color-status-pending-bg: #fef3d7;
  --color-status-pending-fg: #8a6100;
  --color-status-approved-bg: #dcf3e4;
  --color-status-approved-fg: #1a6b38;
  --color-status-rejected-bg: #fbe4e2;
  --color-status-rejected-fg: #8a2c22;

  --shadow-raised: 0 1px 2px rgba(0, 0, 0, 0.06), 0 0 0 1px var(--color-border);
  --shadow-floating: 0 8px 24px rgba(0, 0, 0, 0.1), 0 0 0 1px var(--color-border);
}
```

Note: `--color-primary-foreground`, `--color-destructive-foreground`, and `--font-sans`/`--font-mono` are intentionally omitted from the light override — they don't change between modes.

- [ ] **Step 2: Keep `@layer base` but drop the stale Notion-attribution comment**

Edit `frontend/src/index.css`, in the `@layer base` block, replace the comment above `:focus-visible`:

```css
  /* Both focus-visible rings and reduced-motion are respected by every
     interactive element in this design. */
  :focus-visible {
```

(replacing the old `/* Notion respects both; the measurement recorded... */` comment — everything else in `@layer base` stays as-is.)

- [ ] **Step 3: Manual visual check**

Run: `cd frontend && npm run dev`
Open the app in a browser (or via the `run` skill / Playwright) and confirm the background is now near-black, text is light, and no console errors about missing CSS variables.

- [ ] **Step 4: Run existing tests**

Run: `cd frontend && npm test`
Expected: PASS (token changes are CSS-only, no markup/logic changed).

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/index.css
git commit -m "feat(frontend): retone design tokens to dark-first sleek/technical palette"
```

---

### Task 3: Theme provider (dark/light toggle)

**Files:**
- Create: `frontend/src/app/ThemeProvider.tsx`
- Modify: `frontend/src/app/providers.tsx`

**Interfaces:**
- Produces: `ThemeProvider` (wraps children), `useTheme()` returning `{ theme: "dark" | "light", toggleTheme: () => void }`, consumed by Task 6 (TopNav toggle button).

- [ ] **Step 1: Write `ThemeProvider.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "revisex-theme";

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
} | null>(null);

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((current) => (current === "dark" ? "light" : "dark"));

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
```

Dark is the default/primary mode (per spec) when nothing is stored yet — `readInitialTheme` does not consult `prefers-color-scheme`.

- [ ] **Step 2: Wire into `providers.tsx`**

Modify `frontend/src/app/providers.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ApiError } from "@/lib/api-client";
import { ThemeProvider } from "@/app/ThemeProvider";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error) => {
              if (error instanceof ApiError && error.status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      })
  );

  return (
    <ThemeProvider>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
```

- [ ] **Step 3: Write a test**

Create `frontend/src/app/theme-provider.test.tsx`:

```tsx
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { ThemeProvider, useTheme } from "@/app/ThemeProvider";

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme}>
      {theme}
    </button>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to dark and toggles to light, persisting the choice", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveTextContent("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    act(() => {
      fireEvent.click(screen.getByRole("button"));
    });

    expect(screen.getByRole("button")).toHaveTextContent("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem("revisex-theme")).toBe("light");
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/app/theme-provider.test.tsx`
Expected: PASS

- [ ] **Step 5: Run full suite**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd frontend
git add src/app/ThemeProvider.tsx src/app/providers.tsx src/app/theme-provider.test.tsx
git commit -m "feat(frontend): add dark/light ThemeProvider with localStorage persistence"
```

---

### Task 4: `useReducedMotion` hook

**Files:**
- Create: `frontend/src/hooks/use-reduced-motion.ts`

**Interfaces:**
- Produces: `useReducedMotion(): boolean`, consumed by every motion primitive in Task 5.

- [ ] **Step 1: Write the hook**

```ts
import { useReducedMotion as useFramerReducedMotion } from "framer-motion";

/**
 * Thin wrapper so every motion primitive imports from one place, and so a
 * future non-Framer motion need doesn't force a rename at every call site.
 */
export function useReducedMotion(): boolean {
  return useFramerReducedMotion() ?? false;
}
```

- [ ] **Step 2: Write a test**

Create `frontend/src/hooks/use-reduced-motion.test.tsx`:

```tsx
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

describe("useReducedMotion", () => {
  it("returns a boolean", () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(typeof result.current).toBe("boolean");
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/hooks/use-reduced-motion.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/hooks/use-reduced-motion.ts src/hooks/use-reduced-motion.test.tsx
git commit -m "feat(frontend): add useReducedMotion hook"
```

---

### Task 5: Motion primitives (`PageTransition`, `Reveal`, `Stagger`/`StaggerItem`)

**Files:**
- Create: `frontend/src/components/motion/PageTransition.tsx`
- Create: `frontend/src/components/motion/Reveal.tsx`
- Create: `frontend/src/components/motion/Stagger.tsx`
- Test: `frontend/src/components/motion/motion.test.tsx`

**Interfaces:**
- Consumes: `useReducedMotion` from `@/hooks/use-reduced-motion` (Task 4).
- Produces: `PageTransition({ children })`, `Reveal({ children, className? })`, `Stagger({ children, className? })`, `StaggerItem({ children, className? })`. Consumed by Task 6 (AppShell), Task 9-12 (pages), Task 10 (LandingPage).

- [ ] **Step 1: Write `PageTransition.tsx`**

```tsx
import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  const reducedMotion = useReducedMotion();

  if (reducedMotion) return <>{children}</>;

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

- [ ] **Step 2: Write `Reveal.tsx`**

```tsx
import { motion, type HTMLMotionProps } from "framer-motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export function Reveal({ children, ...props }: HTMLMotionProps<"div">) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) return <div className={props.className}>{children}</div>;

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

- [ ] **Step 3: Write `Stagger.tsx`**

```tsx
import { motion, type HTMLMotionProps } from "framer-motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

export function Stagger({ children, ...props }: HTMLMotionProps<"div">) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) return <div className={props.className}>{children}</div>;

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

export function StaggerItem({ children, ...props }: HTMLMotionProps<"div">) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) return <div className={props.className}>{children}</div>;

  return (
    <motion.div variants={itemVariants} {...props}>
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 4: Write tests**

Create `frontend/src/components/motion/motion.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PageTransition } from "@/components/motion/PageTransition";
import { Reveal } from "@/components/motion/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";

describe("motion primitives", () => {
  it("PageTransition renders children", () => {
    render(
      <MemoryRouter>
        <PageTransition>
          <p>content</p>
        </PageTransition>
      </MemoryRouter>
    );
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("Reveal renders children", () => {
    render(
      <Reveal>
        <p>revealed</p>
      </Reveal>
    );
    expect(screen.getByText("revealed")).toBeInTheDocument();
  });

  it("Stagger and StaggerItem render children", () => {
    render(
      <Stagger>
        <StaggerItem>
          <p>item one</p>
        </StaggerItem>
        <StaggerItem>
          <p>item two</p>
        </StaggerItem>
      </Stagger>
    );
    expect(screen.getByText("item one")).toBeInTheDocument();
    expect(screen.getByText("item two")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/motion/motion.test.tsx`
Expected: PASS. If `whileInView` throws in jsdom about `IntersectionObserver`, note it — Task 13 adds the stub; if failures appear here, pull Task 13's Step 1 forward before continuing.

- [ ] **Step 6: Commit**

```bash
cd frontend
git add src/components/motion/
git commit -m "feat(frontend): add PageTransition, Reveal, Stagger motion primitives"
```

---

### Task 6: Wire `PageTransition` into `AppShell`, theme toggle into `TopNav`

**Files:**
- Modify: `frontend/src/components/layout/AppShell.tsx`
- Modify: `frontend/src/components/layout/TopNav.tsx`

**Interfaces:**
- Consumes: `PageTransition` (Task 5), `useTheme` (Task 3).

- [ ] **Step 1: Wrap `Outlet` in `AppShell`**

Modify `frontend/src/components/layout/AppShell.tsx`:

```tsx
import { Outlet } from "react-router-dom";
import { TopNav } from "./TopNav";
import { PageTransition } from "@/components/motion/PageTransition";

export function AppShell() {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-[90rem] px-6 py-8 sm:px-8">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Add a theme toggle button to `TopNav`**

Modify `frontend/src/components/layout/TopNav.tsx`: add the import and button. Add near the top with the other imports:

```tsx
import { LogOut, Moon, NotebookPen, Settings, Sun, Upload } from "lucide-react";
import { useTheme } from "@/app/ThemeProvider";
```

(replacing the existing `import { LogOut, NotebookPen, Settings, Upload } from "lucide-react";` line — add `Moon, Sun` to that import instead of a separate one).

Inside `TopNav()`, add:

```tsx
  const { theme, toggleTheme } = useTheme();
```

right after the existing `const navigate = useNavigate();` line.

In the JSX, inside `<div className="ml-auto flex items-center gap-2">`, add the toggle as the first child, before the `status === "authenticated"` block:

```tsx
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? (
              <Sun className="size-3.5" strokeWidth={2} aria-hidden="true" />
            ) : (
              <Moon className="size-3.5" strokeWidth={2} aria-hidden="true" />
            )}
          </Button>
```

- [ ] **Step 3: Run existing TopNav-adjacent tests**

Run: `cd frontend && npm test`
Expected: PASS (button addition doesn't remove any existing accessible names/roles the current tests query for).

- [ ] **Step 4: Manual check**

Run: `cd frontend && npm run dev`, click the new sun/moon toggle in the header, confirm the whole app switches between dark and light instantly and the choice survives a page reload.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/components/layout/AppShell.tsx src/components/layout/TopNav.tsx
git commit -m "feat(frontend): wire PageTransition into AppShell, add theme toggle to TopNav"
```

---

### Task 7: Re-theme Dialog/AlertDialog/DropdownMenu with Framer Motion

**Files:**
- Create: `frontend/src/components/motion/overlay-variants.ts`
- Modify: `frontend/src/components/ui/dialog.tsx`
- Modify: `frontend/src/components/ui/alert-dialog.tsx`
- Modify: `frontend/src/components/ui/dropdown-menu.tsx`

**Interfaces:**
- Produces: `overlayVariants`, `contentVariants` (fade), `menuVariants` (fade+scale, for the popover-style DropdownMenu), exported for reuse.
- No change to any of these components' public prop APIs — every existing call site (`ReviewDialog`, `UserForm`, `UsersPage`'s `AlertDialog`, `TopNav`'s `DropdownMenu`, etc.) keeps working unmodified.

Existing usages confirm `Dialog` and `AlertDialog` are always used **controlled** (`open`/`onOpenChange` passed by the caller) in this codebase — that's what makes driving `AnimatePresence` off `open` safe. `DropdownMenu` is used **uncontrolled** everywhere today, so its wrapper takes over state internally rather than requiring callers to change.

- [ ] **Step 1: Write shared variants**

```ts
// frontend/src/components/motion/overlay-variants.ts
export const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const dialogContentVariants = {
  hidden: { opacity: 0, scale: 0.97, y: 8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 380, damping: 30 },
  },
};

export const menuContentVariants = {
  hidden: { opacity: 0, scale: 0.96, y: -4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 420, damping: 32 },
  },
};
```

- [ ] **Step 2: Convert `dialog.tsx`**

Replace the full contents of `frontend/src/components/ui/dialog.tsx`:

```tsx
import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { AnimatePresence, motion } from "framer-motion"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { overlayVariants, dialogContentVariants } from "@/components/motion/overlay-variants"

const DialogOpenContext = React.createContext(false)

function Dialog({
  open,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return (
    <DialogOpenContext.Provider value={!!open}>
      <DialogPrimitive.Root data-slot="dialog" open={open} {...props} />
    </DialogOpenContext.Provider>
  )
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  const open = React.useContext(DialogOpenContext)
  return (
    <DialogPrimitive.Portal data-slot="dialog-portal" forceMount {...props}>
      <AnimatePresence>{open && children}</AnimatePresence>
    </DialogPrimitive.Portal>
  )
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay asChild forceMount data-slot="dialog-overlay" {...props}>
      <motion.div
        className={cn("fixed inset-0 z-50 bg-black/40", className)}
        variants={overlayVariants}
        initial="hidden"
        animate="visible"
        exit="hidden"
        transition={{ duration: 0.15 }}
      />
    </DialogPrimitive.Overlay>
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content asChild forceMount data-slot="dialog-content" {...props}>
        <motion.div
          className={cn(
            "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-panel border border-border bg-surface p-6 shadow-floating sm:max-w-lg",
            className
          )}
          variants={dialogContentVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-control opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-base font-semibold text-text-primary", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-ui text-text-muted", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
```

This preserves the original `DialogHeader`/`DialogFooter`/`DialogTitle`/`DialogDescription` (only retoned onto `bg-surface`/`border-border` instead of the old `bg-background`/borderless look) and adds the Framer-driven overlay/content.

- [ ] **Step 3: Convert `alert-dialog.tsx`**

Apply the identical pattern to `frontend/src/components/ui/alert-dialog.tsx`: add the `DialogOpenContext`-equivalent (`AlertDialogOpenContext`), read `open` in `AlertDialog`, force-mount + `AnimatePresence` in `AlertDialogPortal`, `asChild` + `motion.div` with `overlayVariants` in `AlertDialogOverlay`, `asChild` + `motion.div` with `dialogContentVariants` in `AlertDialogContent`. Concretely, replace the top of the file through `AlertDialogContent`:

```tsx
import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "radix-ui"
import { AnimatePresence, motion } from "framer-motion"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { overlayVariants, dialogContentVariants } from "@/components/motion/overlay-variants"

const AlertDialogOpenContext = React.createContext(false)

function AlertDialog({
  open,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return (
    <AlertDialogOpenContext.Provider value={!!open}>
      <AlertDialogPrimitive.Root data-slot="alert-dialog" open={open} {...props} />
    </AlertDialogOpenContext.Provider>
  )
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogPortal({
  children,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  const open = React.useContext(AlertDialogOpenContext)
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" forceMount {...props}>
      <AnimatePresence>{open && children}</AnimatePresence>
    </AlertDialogPrimitive.Portal>
  )
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay asChild forceMount data-slot="alert-dialog-overlay" {...props}>
      <motion.div
        className={cn("fixed inset-0 z-50 bg-black/40", className)}
        variants={overlayVariants}
        initial="hidden"
        animate="visible"
        exit="hidden"
        transition={{ duration: 0.15 }}
      />
    </AlertDialogPrimitive.Overlay>
  )
}

function AlertDialogContent({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  size?: "default" | "sm"
}) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content asChild forceMount data-slot="alert-dialog-content" data-size={size} {...props}>
        <motion.div
          className={cn(
            "group/alert-dialog-content fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-panel border border-border bg-surface p-6 shadow-floating data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm",
            className
          )}
          variants={dialogContentVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          {props.children}
        </motion.div>
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  )
}
```

Keep the rest of the file (`AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogMedia`, `AlertDialogAction`, `AlertDialogCancel`, and the final `export { ... }` block) exactly as they are today — only retone `AlertDialogTitle`'s className to include `text-text-primary` and `AlertDialogDescription`'s to `text-text-muted` (both already reference `text-ui`/`text-base`, just add the color token if missing).

Note: `AlertDialogContent`'s `motion.div` now owns `{props.children}` directly instead of spreading `...props` onto the Radix `Content` (since `children` must go on the inner `motion.div`, not the Radix wrapper, once `asChild` is used) — destructure `children` out of `props` alongside `className`/`size` at the top of the function signature: `{ className, size = "default", children, ...props }`.

- [ ] **Step 4: Convert `dropdown-menu.tsx`**

`DropdownMenu` is used uncontrolled everywhere today (confirmed: `TopNav.tsx` renders bare `<DropdownMenu>` with no `open`/`onOpenChange`). Make the wrapper self-manage open state so `AnimatePresence` has something to key off, while still forwarding an `onOpenChange` if a future caller passes one:

At the top of `frontend/src/components/ui/dropdown-menu.tsx`, add the import and context, and replace the `DropdownMenu` and `DropdownMenuContent` functions:

```tsx
"use client"

import * as React from "react"
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"
import { AnimatePresence, motion } from "framer-motion"

import { cn } from "@/lib/utils"
import { menuContentVariants } from "@/components/motion/overlay-variants"

const DropdownMenuOpenContext = React.createContext(false)

function DropdownMenu({
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  const [open, setOpen] = React.useState(false)
  return (
    <DropdownMenuOpenContext.Provider value={open}>
      <DropdownMenuPrimitive.Root
        data-slot="dropdown-menu"
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          onOpenChange?.(next)
        }}
        {...props}
      />
    </DropdownMenuOpenContext.Provider>
  )
}
```

Replace `DropdownMenuContent` with:

```tsx
function DropdownMenuContent({
  className,
  sideOffset = 4,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  const open = React.useContext(DropdownMenuOpenContext)
  return (
    <DropdownMenuPrimitive.Portal forceMount>
      <AnimatePresence>
        {open && (
          <DropdownMenuPrimitive.Content
            asChild
            forceMount
            data-slot="dropdown-menu-content"
            sideOffset={sideOffset}
            {...props}
          >
            <motion.div
              className={cn(
                "z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-card border border-border bg-popover p-1 text-popover-foreground shadow-floating",
                className
              )}
              variants={menuContentVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              {children}
            </motion.div>
          </DropdownMenuPrimitive.Content>
        )}
      </AnimatePresence>
    </DropdownMenuPrimitive.Portal>
  )
}
```

Leave every other export in `dropdown-menu.tsx` (`DropdownMenuGroup`, `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuShortcut`, `DropdownMenuSub*`, `DropdownMenuRadioGroup`, `DropdownMenuCheckboxItem`, `DropdownMenuRadioItem`, and the final `export { ... }` block) unchanged.

- [ ] **Step 5: Run existing tests that exercise these components**

Run: `cd frontend && npm test`
Expected: PASS. If a test that opens a `Dialog`/`AlertDialog`/`DropdownMenu` and immediately asserts on content now fails because content renders inside `AnimatePresence` — check whether it's a timing issue (content is present in the DOM immediately since `initial`/`animate` don't delay mounting, only visual opacity/transform) before changing test code. jsdom doesn't run real animations, so content should be queryable synchronously.

- [ ] **Step 6: Manual check**

Run: `cd frontend && npm run dev`. Open the account dropdown in `TopNav`, open a confirmation `AlertDialog` (e.g. delete-user flow in `UsersPage`), open a `Dialog` (e.g. `ReviewDialog` from the moderation queue). Confirm each animates in/out smoothly and closes on outside click / Escape as before.

- [ ] **Step 7: Commit**

```bash
cd frontend
git add src/components/motion/overlay-variants.ts src/components/ui/dialog.tsx src/components/ui/alert-dialog.tsx src/components/ui/dropdown-menu.tsx
git commit -m "feat(frontend): drive Dialog/AlertDialog/DropdownMenu open/close with Framer Motion"
```

---

### Task 8: Command palette

**Files:**
- Create: `frontend/src/hooks/use-command-palette.ts`
- Create: `frontend/src/components/command-palette/CommandPalette.tsx`
- Modify: `frontend/src/components/layout/AppShell.tsx`
- Test: `frontend/src/components/command-palette/command-palette.test.tsx`

**Interfaces:**
- Consumes: `useAuth` (`@/features/auth/useAuth`), `useMyPermissions` (`@/features/admin/queries`), `overlayVariants`/`dialogContentVariants` (Task 7).
- Produces: `<CommandPalette />` (self-contained, listens for its own shortcut), mounted once in `AppShell`.

- [ ] **Step 1: Write the shortcut hook**

```ts
// frontend/src/hooks/use-command-palette.ts
import { useEffect, useState } from "react";

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return { open, setOpen };
}
```

- [ ] **Step 2: Write `CommandPalette.tsx`**

```tsx
import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useMyPermissions } from "@/features/admin/queries";
import { useAuth } from "@/features/auth/useAuth";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { overlayVariants, dialogContentVariants } from "@/components/motion/overlay-variants";

const ADMIN_ROLES = ["superuser", "program_admin", "branch_admin"] as const;

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const { status, user } = useAuth();
  const { data: permissions } = useMyPermissions();
  const navigate = useNavigate();

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  const isAdmin = !!user && ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
          <motion.div
            className="fixed inset-0 bg-black/40"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={() => setOpen(false)}
          />
          <motion.div
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-panel border border-border bg-surface-elevated shadow-floating"
            variants={dialogContentVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            <Command label="Command palette" shouldFilter>
              <Command.Input
                autoFocus
                placeholder="Jump to..."
                className="w-full border-b border-border bg-transparent px-4 py-3 text-ui text-text-primary outline-none placeholder:text-text-muted"
              />
              <Command.List className="max-h-80 overflow-y-auto p-2">
                <Command.Empty className="px-2 py-6 text-center text-ui text-text-muted">
                  No matches.
                </Command.Empty>
                <Command.Group heading="Navigate" className="text-caption text-text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                  <Command.Item
                    onSelect={() => go("/browse")}
                    className="cursor-pointer rounded-control px-2 py-2 text-ui text-text-primary data-[selected=true]:bg-accent"
                  >
                    Browse programs
                  </Command.Item>
                  <Command.Item
                    onSelect={() => go("/search")}
                    className="cursor-pointer rounded-control px-2 py-2 text-ui text-text-primary data-[selected=true]:bg-accent"
                  >
                    Search notes
                  </Command.Item>
                  {status === "authenticated" && (
                    <>
                      <Command.Item
                        onSelect={() => go("/home")}
                        className="cursor-pointer rounded-control px-2 py-2 text-ui text-text-primary data-[selected=true]:bg-accent"
                      >
                        Home
                      </Command.Item>
                      <Command.Item
                        onSelect={() => go("/my-uploads")}
                        className="cursor-pointer rounded-control px-2 py-2 text-ui text-text-primary data-[selected=true]:bg-accent"
                      >
                        My uploads
                      </Command.Item>
                      <Command.Item
                        onSelect={() => go("/upload")}
                        className="cursor-pointer rounded-control px-2 py-2 text-ui text-text-primary data-[selected=true]:bg-accent"
                      >
                        Upload a note
                      </Command.Item>
                      {isAdmin && (
                        <Command.Item
                          onSelect={() => go("/moderate")}
                          className="cursor-pointer rounded-control px-2 py-2 text-ui text-text-primary data-[selected=true]:bg-accent"
                        >
                          Moderation queue
                        </Command.Item>
                      )}
                      {permissions && permissions.size > 0 && (
                        <Command.Item
                          onSelect={() => go("/admin")}
                          className="cursor-pointer rounded-control px-2 py-2 text-ui text-text-primary data-[selected=true]:bg-accent"
                        >
                          Admin
                        </Command.Item>
                      )}
                    </>
                  )}
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: Mount it in `AppShell`**

Modify `frontend/src/components/layout/AppShell.tsx` (from Task 6's version):

```tsx
import { Outlet } from "react-router-dom";
import { TopNav } from "./TopNav";
import { PageTransition } from "@/components/motion/PageTransition";
import { CommandPalette } from "@/components/command-palette/CommandPalette";

export function AppShell() {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <CommandPalette />
      <main className="mx-auto max-w-[90rem] px-6 py-8 sm:px-8">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Write a test**

Create `frontend/src/components/command-palette/command-palette.test.tsx`. Check `frontend/src/routes/home-page.test.tsx` first for this repo's existing pattern of wrapping routed components with providers/MSW handlers before writing this test, then follow it. At minimum, assert:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { CommandPalette } from "@/components/command-palette/CommandPalette";

// Wrap with the same QueryClientProvider/AuthProvider test setup used by
// frontend/src/routes/home-page.test.tsx — see that file for the exact
// wrapper this repo already uses for routed, query-dependent components.

describe("CommandPalette", () => {
  it("opens on Cmd+K and closes on Escape", () => {
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    );

    expect(screen.queryByPlaceholderText("Jump to...")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByPlaceholderText("Jump to...")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByPlaceholderText("Jump to...")).not.toBeInTheDocument();
  });
});
```

If `useAuth`/`useMyPermissions` require a provider tree this bare `MemoryRouter` doesn't supply, wrap with the same test harness `home-page.test.tsx` uses (import and reuse it) rather than duplicating provider setup.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/command-palette/command-palette.test.tsx`
Expected: PASS

- [ ] **Step 6: Run full suite**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 7: Manual check**

Run: `cd frontend && npm run dev`, press `Cmd+K`/`Ctrl+K`, confirm the palette opens, filters as you type, and navigates on select.

- [ ] **Step 8: Commit**

```bash
cd frontend
git add src/hooks/use-command-palette.ts src/components/command-palette/ src/components/layout/AppShell.tsx
git commit -m "feat(frontend): add Cmd/Ctrl+K command palette"
```

---

### Task 9: Router changes — landing page at `/`, `HomePage` moves to protected `/home`

**Files:**
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/routes/LoginPage.tsx`
- Modify: `frontend/src/routes/RegisterPage.tsx`
- Modify: `frontend/src/app/router.test.tsx`

**Interfaces:**
- Consumes: `LandingPage` (Task 10 creates the component; this task can reference it before Task 10 lands since both are part of the same review cycle — if executing tasks strictly in order, complete Task 10's Step 1 file creation first, or do Task 10 before this task).
- Produces: `/` renders `LandingPage` (public); `/home` renders `HomePage` (protected).

- [ ] **Step 1: Update `router.tsx`**

Modify `frontend/src/app/router.tsx`:

```tsx
import { Navigate, Route, Routes } from "react-router-dom";
import { AdminShell } from "@/components/layout/AdminShell";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { AdminUsersPage } from "@/routes/admin/AdminUsersPage";
import { AuditLogPage } from "@/routes/admin/AuditLogPage";
import { RolesPage } from "@/routes/admin/RolesPage";
import { BranchesPage } from "@/routes/BranchesPage";
import { HomePage } from "@/routes/HomePage";
import { LandingPage } from "@/routes/LandingPage";
import { LoginPage } from "@/routes/LoginPage";
import { ModerationPage } from "@/routes/ModerationPage";
import { MyUploadsPage } from "@/routes/MyUploadsPage";
import { NotFoundPage } from "@/routes/NotFoundPage";
import { NoteDetailPage } from "@/routes/NoteDetailPage";
import { RegisterPage } from "@/routes/RegisterPage";
import { SettingsPage } from "@/routes/SettingsPage";
import { ProgramsPage } from "@/routes/ProgramsPage";
import { SearchPage } from "@/routes/SearchPage";
import { SubjectNotesPage } from "@/routes/SubjectNotesPage";
import { SubjectsPage } from "@/routes/SubjectsPage";
import { UploadPage } from "@/routes/UploadPage";
import { UsersPage } from "@/routes/UsersPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<LandingPage />} />
        <Route path="browse" element={<ProgramsPage />} />
        <Route path="programs/:programId" element={<BranchesPage />} />
        <Route path="branches/:branchId" element={<SubjectsPage />} />
        <Route path="subjects/:subjectId" element={<SubjectNotesPage />} />
        <Route path="notes/:noteId" element={<NoteDetailPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="home" element={<HomePage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="my-uploads" element={<MyUploadsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="moderate" element={<ModerationPage />} />
          <Route path="admin/users" element={<UsersPage />} />

          <Route path="admin" element={<AdminShell />}>
            <Route index element={<Navigate to="accounts" replace />} />
            <Route path="accounts" element={<AdminUsersPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="audit-log" element={<AuditLogPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 2: Update `LoginPage.tsx` redirect target**

Modify `frontend/src/routes/LoginPage.tsx`, changing the `"/"` fallback to `"/home"`:

```tsx
  const from = (location.state as { from?: string } | null)?.from ?? "/home";
```

and:

```tsx
  if (status === "authenticated") return <Navigate to={from} replace />;
```

(the `Navigate to={from}` line is unchanged code — only the `?? "/home"` fallback default changes.)

- [ ] **Step 3: Update `RegisterPage.tsx` redirect target**

Modify `frontend/src/routes/RegisterPage.tsx`:

```tsx
  if (status === "authenticated") return <Navigate to="/home" replace />;
```

and:

```tsx
      <RegisterForm onSuccess={() => navigate("/home", { replace: true })} />
```

- [ ] **Step 4: Update `TopNav`'s wordmark link**

The `TopNav`'s `<Link to="/">` wordmark currently always points home. Since `/` is now the public landing page, decide per auth state — modify `frontend/src/components/layout/TopNav.tsx`:

```tsx
        <Link to={status === "authenticated" ? "/home" : "/"} className="flex items-center gap-2 text-ui font-semibold tracking-tight">
```

(replacing `<Link to="/" className="flex items-center gap-2 text-ui font-semibold tracking-tight">`.)

- [ ] **Step 5: Update `router.test.tsx`**

Read `frontend/src/app/router.test.tsx` first to see its existing assertions and test harness pattern. Update any assertion that navigates to `/` and expects `HomePage` content to instead expect `LandingPage` content, and add/adjust a case that navigates to `/home` (as an authenticated user, via whatever auth-mocking pattern the file already uses) and expects the former `HomePage` content. Follow the file's existing structure — don't introduce a new test-setup pattern if one already exists there.

- [ ] **Step 6: Run router tests**

Run: `cd frontend && npx vitest run src/app/router.test.tsx`
Expected: PASS after Step 5's updates (will fail before Task 10 creates `LandingPage` — do Task 10 first if executing out of order, or treat Tasks 9 and 10 as one combined review unit).

- [ ] **Step 7: Commit**

```bash
cd frontend
git add src/app/router.tsx src/app/router.test.tsx src/routes/LoginPage.tsx src/routes/RegisterPage.tsx src/components/layout/TopNav.tsx
git commit -m "feat(frontend): move HomePage to protected /home, add landing route at /"
```

---

### Task 10: Build `LandingPage`

**Files:**
- Create: `frontend/src/routes/LandingPage.tsx`
- Create: `frontend/src/routes/landing-page.test.tsx`

**Interfaces:**
- Consumes: `Button` (`@/components/ui/button`), `Reveal`/`Stagger`/`StaggerItem` (Task 5).
- Produces: `LandingPage` component, consumed by `router.tsx` (Task 9).

Do this task before Task 9's Step 6 (router test run), since `router.tsx` imports `LandingPage`.

- [ ] **Step 1: Write `LandingPage.tsx`**

```tsx
import { ArrowRight, LayoutGrid, ShieldCheck, Upload as UploadIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";

const FEATURES = [
  {
    icon: LayoutGrid,
    title: "Browse by course",
    body: "Program, branch, semester, subject — pick your way down to exactly the notes you need.",
  },
  {
    icon: ShieldCheck,
    title: "Moderated for quality",
    body: "Every upload is reviewed before it's approved, so what you find has already been checked.",
  },
  {
    icon: UploadIcon,
    title: "Give back in minutes",
    body: "Upload your own notes in two steps and they're in front of the next person in your class.",
  },
];

export function LandingPage() {
  return (
    <div className="flex flex-col gap-24 pb-16">
      <section className="flex flex-col items-start gap-6 pt-16 text-left">
        <span className="rounded-control border border-border bg-surface px-2.5 py-1 font-mono text-caption text-text-muted">
          College notes, organized
        </span>
        <h1 className="max-w-2xl text-display font-semibold tracking-tight text-text-primary">
          Find the notes your syllabus already promised you.
        </h1>
        <p className="max-w-lg text-lead text-text-muted">
          A shared, moderated library of notes organized by program, branch, and subject —
          browse what your classmates uploaded, or add your own.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
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
          <Button asChild size="lg" variant="outline">
            <Link to="/login">Log in</Link>
          </Button>
        </div>
      </section>

      <Reveal>
        <section className="max-w-2xl">
          <p className="text-lead text-text-primary">
            Course notes end up scattered across chats, drives, and forgotten folders. This is
            one place for them instead — structured the way your program already is, and checked
            before it's published, so what you find is worth opening.
          </p>
        </section>
      </Reveal>

      <Stagger className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <StaggerItem key={feature.title}>
            <div className="flex h-full flex-col gap-3 rounded-panel border border-border bg-surface p-5">
              <span className="flex size-9 items-center justify-center rounded-control bg-accent text-accent-foreground">
                <feature.icon className="size-4" strokeWidth={2} aria-hidden="true" />
              </span>
              <h2 className="text-ui font-semibold text-text-primary">{feature.title}</h2>
              <p className="text-ui text-text-muted">{feature.body}</p>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal className="flex flex-col items-start gap-4 rounded-panel border border-border bg-surface-elevated p-8">
        <h2 className="text-title font-semibold text-text-primary">Ready to find your notes?</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link to="/register">Create an account</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/login">Log in</Link>
          </Button>
        </div>
      </Reveal>
    </div>
  );
}
```

- [ ] **Step 2: Write a test**

Read `frontend/src/routes/home-page.test.tsx` first for this repo's routed-component test harness (provider wrapping, MSW setup if any), then follow the same pattern. `LandingPage` needs no data fetching, so no MSW handlers should be required — only routing context for the `Link`s:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LandingPage } from "@/routes/LandingPage";

describe("LandingPage", () => {
  it("renders the hero headline and both CTAs", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", { name: /find the notes your syllabus already promised you/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /get started/i })).toHaveAttribute("href", "/register");
    expect(screen.getAllByRole("link", { name: /log in/i })[0]).toHaveAttribute("href", "/login");
  });

  it("renders all feature highlights", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(screen.getByText("Browse by course")).toBeInTheDocument();
    expect(screen.getByText("Moderated for quality")).toBeInTheDocument();
    expect(screen.getByText("Give back in minutes")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/routes/landing-page.test.tsx`
Expected: PASS (may require Task 13's `IntersectionObserver` stub if `whileInView` throws in jsdom — apply that stub first if so).

- [ ] **Step 4: Manual check**

Run: `cd frontend && npm run dev`, visit `/` logged out, confirm the hero, value prop, feature cards (staggering in as you scroll), and closing CTA all render and both buttons navigate correctly.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/routes/LandingPage.tsx src/routes/landing-page.test.tsx
git commit -m "feat(frontend): add public LandingPage"
```

---

### Task 11: Apply `Stagger` to the three list-heavy pages

**Files:**
- Modify: `frontend/src/routes/HomePage.tsx`
- Modify: `frontend/src/routes/SearchPage.tsx`
- Modify: `frontend/src/routes/SubjectNotesPage.tsx`

**Interfaces:**
- Consumes: `Stagger`, `StaggerItem` (Task 5).
- `HomePage`'s data-fetching, props, and rendered information are unchanged — only the wrapper around its card grids.

- [ ] **Step 1: Wrap `HomePage`'s note/program grids**

In `frontend/src/routes/HomePage.tsx`, find the grid(s) that `.map()` over `programs`/`recentNotes` (e.g. `<div className="grid ...">{programs.data?.items.map(...)}</div>`). Import `Stagger, StaggerItem` from `@/components/motion/Stagger`, replace the grid wrapper `<div className="grid ...">` with `<Stagger className="grid ...">` (same className, just the tag/component swap), and wrap each mapped child's returned JSX in `<StaggerItem key={...}>...</StaggerItem>` — move the `key` prop from the mapped element onto `StaggerItem` and drop it from the inner element (React needs the key on the outermost element returned from `.map`, which is now `StaggerItem`).

- [ ] **Step 2: Wrap `SearchPage`'s results grid**

Same treatment in `frontend/src/routes/SearchPage.tsx`: read the file first to find the exact grid container and `.map()` call over search results, then apply the identical `Stagger`/`StaggerItem` swap described in Step 1.

- [ ] **Step 3: Wrap `SubjectNotesPage`'s notes list**

Same treatment in `frontend/src/routes/SubjectNotesPage.tsx`: find the notes list/grid and `.map()` call, apply the same swap.

- [ ] **Step 4: Run existing tests for these three pages**

Run: `cd frontend && npx vitest run src/routes/home-page.test.tsx src/routes/subject-notes-page.test.tsx`
Expected: PASS — swapping `div`→`Stagger`/`StaggerItem` (both ultimately render a `div` in the DOM) shouldn't change any queryable text/role/testid these tests assert on. If `SearchPage` has its own test file, run it too.

- [ ] **Step 5: Manual check**

Run: `cd frontend && npm run dev`. Visit `/home`, `/search` (with a query that returns results), and a subject notes page. Confirm cards cascade in on scroll/load instead of appearing all at once.

- [ ] **Step 6: Commit**

```bash
cd frontend
git add src/routes/HomePage.tsx src/routes/SearchPage.tsx src/routes/SubjectNotesPage.tsx
git commit -m "feat(frontend): stagger-in note/program result grids"
```

---

### Task 12: Apply `Reveal` to remaining pages

**Files:**
- Modify: `frontend/src/routes/NoteDetailPage.tsx`
- Modify: `frontend/src/routes/SubjectsPage.tsx`
- Modify: `frontend/src/routes/BranchesPage.tsx`
- Modify: `frontend/src/routes/ProgramsPage.tsx`
- Modify: `frontend/src/routes/UploadPage.tsx`
- Modify: `frontend/src/routes/MyUploadsPage.tsx`
- Modify: `frontend/src/routes/SettingsPage.tsx`
- Modify: `frontend/src/routes/ModerationPage.tsx`
- Modify: `frontend/src/routes/UsersPage.tsx`
- Modify: `frontend/src/routes/admin/AdminUsersPage.tsx`
- Modify: `frontend/src/routes/admin/RolesPage.tsx`
- Modify: `frontend/src/routes/admin/AuditLogPage.tsx`

**Interfaces:**
- Consumes: `Reveal` (Task 5).
- No page's data-fetching, props, or logic changes — only its outermost returned JSX gets wrapped.

- [ ] **Step 1: Wrap each page's top-level return in `Reveal`**

For each file listed above: read the file, find its component's `return (...)` statement, import `Reveal` from `@/components/motion/Reveal`, and wrap the single top-level JSX element the component returns in `<Reveal>...</Reveal>` (if the component already returns a single wrapping `<div>`/`<section>`/fragment, put `Reveal` around that; if it returns a bare fragment `<>...</>`, replace the fragment tags with `<Reveal>`/`</Reveal>`). Do this one file at a time, running that file's own test (if one exists) immediately after each edit rather than batching all twelve edits before testing.

This is a shallow, mechanical wrap — do not touch any JSX inside each page beyond adding the single outer `Reveal`.

- [ ] **Step 2: Run the full test suite after all twelve files are wrapped**

Run: `cd frontend && npm test`
Expected: PASS. `Reveal` renders a `motion.div` (or plain `div` under reduced motion) with no semantic role of its own, so it shouldn't interfere with any existing `getByRole`/`getByText` queries.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Manual check**

Run: `cd frontend && npm run dev`. Spot-check three or four of the twelve pages (e.g. `NoteDetailPage`, `UploadPage`, `ModerationPage`, one admin page) and confirm each fades/slides in on load without layout shift or clipped content.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/routes/NoteDetailPage.tsx src/routes/SubjectsPage.tsx src/routes/BranchesPage.tsx src/routes/ProgramsPage.tsx src/routes/UploadPage.tsx src/routes/MyUploadsPage.tsx src/routes/SettingsPage.tsx src/routes/ModerationPage.tsx src/routes/UsersPage.tsx src/routes/admin/AdminUsersPage.tsx src/routes/admin/RolesPage.tsx src/routes/admin/AuditLogPage.tsx
git commit -m "feat(frontend): reveal remaining pages on entrance"
```

---

### Task 13: Test environment support for `whileInView`

**Files:**
- Modify: `frontend/src/test/setup.ts`

**Interfaces:**
- Produces: a global `IntersectionObserver` stub available to every test file, so `Reveal`/`Stagger`'s `whileInView` doesn't throw under jsdom (which has no native `IntersectionObserver`).

If Task 5's or Task 10's tests already passed without this (Framer Motion may no-op `whileInView` gracefully when the API is absent, animating immediately), do this task anyway for forward-safety, but note in the commit message that it was preventive.

- [ ] **Step 1: Add the stub**

Modify `frontend/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw";

// jsdom has no IntersectionObserver; Framer Motion's `whileInView` (used by
// the Reveal/Stagger motion primitives) needs one to exist, even as a stub
// that never actually fires — components should just render eagerly under
// test rather than waiting for a real viewport intersection.
class MockIntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

// @ts-expect-error -- test-only global stub, not a full spec implementation
global.IntersectionObserver = MockIntersectionObserver;

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

- [ ] **Step 2: Run the full suite**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd frontend
git add src/test/setup.ts
git commit -m "test(frontend): stub IntersectionObserver for whileInView motion primitives"
```

---

### Task 14: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full automated suite**

Run: `cd frontend && npm test && npm run typecheck && npm run lint`
Expected: all three PASS.

- [ ] **Step 2: Manual browser walkthrough**

Run: `cd frontend && npm run dev` and, via the browser (or the `run` skill / Playwright MCP tools if available), walk:
1. `/` logged out — landing page loads, hero/value-prop/features/CTA all present and animated, both CTAs work.
2. Register a new account (or log in with an existing one) — lands on `/home`, which renders exactly what the old root `HomePage` used to show.
3. Log out, try navigating directly to `/home` in the URL bar — redirected to `/login`, not shown the dashboard.
4. `Cmd/Ctrl+K` from any page — command palette opens, filters, navigates.
5. Toggle the theme (sun/moon button) — whole app switches dark/light, survives a reload.
6. Open a `Dialog` (e.g. `ReviewDialog` in moderation) and a `DropdownMenu` (account menu) — both animate smoothly.
7. `/browse` and a couple of levels deep (`/programs/:id`, `/subjects/:id`) while logged out — still accessible without login, per the "existing public browse routes are unaffected" constraint.

- [ ] **Step 3: Report any regressions found**

If any check in Step 2 fails, do not commit further — file it as a follow-up fix in the current task's scope (this plan's tasks are all reversible/independently testable, so identify which task introduced the regression and fix it there) before considering the plan complete.
