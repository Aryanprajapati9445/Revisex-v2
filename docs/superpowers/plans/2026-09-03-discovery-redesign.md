# Discovery Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the visual and metadata gaps in the Discovery page category (HomePage, ProgramsPage, BranchesPage, SubjectsPage, SubjectNotesPage, SearchPage, NoteDetailPage) by adding three missing shared components and applying them consistently, rebuilding HomePage around real data, and expanding NoteDetailPage's metadata.

**Architecture:** Component-first: build `PageHeader`, `LoadingState`, and `SearchInput` in `frontend/src/components/layout/` and `frontend/src/components/ui/` first (Tasks 1-3), each with its own unit test. Then apply them page by page (Tasks 4-10), reusing existing hooks (`usePrograms`, `useBranches`, `useSubjects`, `useNotes`, `useNote`, `useNoteFiles`, `useProgram`, `useBranch`, `useSubject`) — no new API calls, no backend changes.

**Tech Stack:** React 19, TypeScript, TanStack Query, React Router, Tailwind v4 (custom token classes: `rounded-control`/`rounded-card`/`rounded-panel`, `text-title`/`text-lead`/`text-ui`/`text-caption`, `bg-surface`/`bg-background`), Vitest + Testing Library + MSW, `cn()` from `@/lib/utils`.

**Spec:** `docs/superpowers/specs/2026-09-03-discovery-redesign-design.md`

## Global Constraints

- No borders on new components (the design system's "no borders" rule — separation via `shadow-raised`/`shadow-floating` and the `bg-background`/`bg-surface` tint flip only).
- No invented data: every value shown must come from a real API field. Do not add uploader display name (no resolvable endpoint — confirmed in spec).
- Reuse existing hooks and components (`NoteCard`, `TaxonomyCard`, `EmptyState`, `ErrorState`, `Breadcrumbs`, `Pagination`, `StatusPill`, `NoteTypeFilter`) — do not create parallel versions.
- Every new/changed page-level loading state uses `role="status"`; every error/empty state keeps the existing `ErrorState`/`EmptyState` components untouched (their behavior is already correct and tested).
- Respect `prefers-reduced-motion` — do not add motion to `LoadingState`'s pulse beyond Tailwind's existing `animate-pulse` (which already respects reduced-motion via the project's global CSS, matching every other `animate-*` use already in the codebase).
- All new component files export a single named function matching the file name, following the existing convention (`export function PageHeader(...)`, not `export default`).

---

### Task 1: `PageHeader` component

**Files:**
- Create: `frontend/src/components/layout/PageHeader.tsx`
- Test: `frontend/src/components/layout/layout.test.tsx` (append to existing file)

**Interfaces:**
- Produces: `PageHeader({ breadcrumbs?: ReactNode; title: string; description?: ReactNode; action?: ReactNode })` — a page-level heading block. `breadcrumbs` renders above the title row; `action` renders right-aligned next to the title/description column on wide screens and wraps below on narrow ones.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/components/layout/layout.test.tsx` (add this import alongside the existing ones at the top: `import { PageHeader } from "./PageHeader";`):

```tsx
describe("PageHeader", () => {
  it("renders title, description, breadcrumbs, and an action", () => {
    renderWithProviders(
      <PageHeader
        breadcrumbs={<nav aria-label="Breadcrumb">Programs</nav>}
        title="Computer Science"
        description="CSE · 8 semesters"
        action={<button type="button">Do thing</button>}
      />
    );

    expect(screen.getByRole("heading", { name: "Computer Science" })).toBeInTheDocument();
    expect(screen.getByText("CSE · 8 semesters")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Do thing" })).toBeInTheDocument();
  });

  it("renders without breadcrumbs or an action", () => {
    renderWithProviders(<PageHeader title="Search" />);

    expect(screen.getByRole("heading", { name: "Search" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/layout/layout.test.tsx`
Expected: FAIL — `Cannot find module './PageHeader'` (or similar resolution error), since the file doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/components/layout/PageHeader.tsx`:

```tsx
import type { ReactNode } from "react";

export function PageHeader({
  breadcrumbs,
  title,
  description,
  action,
}: {
  breadcrumbs?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {breadcrumbs}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-title font-bold text-text-primary">{title}</h1>
          {description && <div className="text-lead text-text-muted">{description}</div>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/layout/layout.test.tsx`
Expected: PASS (all `PageHeader` and pre-existing `StatusPill`/`ErrorState` tests green)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/PageHeader.tsx frontend/src/components/layout/layout.test.tsx
git commit -m "feat(frontend): add PageHeader shared component"
```

---

### Task 2: `LoadingState` component

**Files:**
- Create: `frontend/src/components/layout/LoadingState.tsx`
- Test: `frontend/src/components/layout/layout.test.tsx` (append)

**Interfaces:**
- Produces: `LoadingState({ variant?: "cards" | "detail"; count?: number })`. `"cards"` (default) renders `count` (default 6) skeleton blocks in a responsive grid, for taxonomy/note list pages. `"detail"` renders a single-column skeleton, for `NoteDetailPage`. Root element carries `role="status"` and an accessible label so tests and screen readers can find it during a fetch, matching the pattern already used by `ErrorState`'s `role="alert"`/`role="status"`.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/components/layout/layout.test.tsx` (add `import { LoadingState } from "./LoadingState";`):

```tsx
describe("LoadingState", () => {
  it("renders a status region with card skeletons by default", () => {
    renderWithProviders(<LoadingState />);
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
  });

  it("renders a detail skeleton for the detail variant", () => {
    renderWithProviders(<LoadingState variant="detail" />);
    const status = screen.getByRole("status", { name: /loading/i });
    expect(status.querySelectorAll("[data-skeleton-block]").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/layout/layout.test.tsx`
Expected: FAIL — `Cannot find module './LoadingState'`

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/components/layout/LoadingState.tsx`:

```tsx
export function LoadingState({
  variant = "cards",
  count = 6,
}: {
  variant?: "cards" | "detail";
  count?: number;
}) {
  if (variant === "detail") {
    return (
      <div role="status" aria-label="Loading" className="flex flex-col gap-4">
        <div data-skeleton-block className="h-7 w-2/3 animate-pulse rounded-control bg-surface" />
        <div data-skeleton-block className="h-4 w-1/3 animate-pulse rounded-control bg-surface" />
        <div data-skeleton-block className="h-32 w-full animate-pulse rounded-panel bg-surface" />
        <div data-skeleton-block className="h-12 w-full animate-pulse rounded-card bg-surface" />
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label="Loading"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} data-skeleton-block className="h-28 animate-pulse rounded-card bg-surface" />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/layout/layout.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/LoadingState.tsx frontend/src/components/layout/layout.test.tsx
git commit -m "feat(frontend): add LoadingState shared component"
```

---

### Task 3: `SearchInput` component

**Files:**
- Create: `frontend/src/components/ui/search-input.tsx`
- Test: Create `frontend/src/components/ui/ui.test.tsx`

**Interfaces:**
- Consumes: `Input` from `@/components/ui/input` (existing, no changes), `cn` from `@/lib/utils`.
- Produces: `SearchInput({ value: string; onChange: (value: string) => void; placeholder?: string; className?: string })` — a labeled `type="search"` input with a leading search icon and a clear button shown only when `value` is non-empty.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/ui/ui.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { SearchInput } from "./search-input";

describe("SearchInput", () => {
  it("calls onChange as the user types", async () => {
    const onChange = vi.fn();
    renderWithProviders(<SearchInput value="" onChange={onChange} />);

    await userEvent.type(screen.getByRole("searchbox"), "graphs");
    expect(onChange).toHaveBeenLastCalledWith("s");
  });

  it("shows a clear button only when there is a value, and clears on click", async () => {
    const onChange = vi.fn();
    const { rerender } = renderWithProviders(<SearchInput value="" onChange={onChange} />);
    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();

    rerender(<SearchInput value="graphs" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/ui/ui.test.tsx`
Expected: FAIL — `Cannot find module './search-input'`

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/components/ui/search-input.tsx`:

```tsx
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SearchInput({
  value,
  onChange,
  placeholder = "Search notes…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative flex flex-1 items-center", className)}>
      <Search
        className="pointer-events-none absolute left-2.5 size-4 text-text-tertiary"
        strokeWidth={2}
        aria-hidden="true"
      />
      <label className="flex-1">
        <span className="sr-only">Search notes</span>
        <Input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="pl-8 pr-8"
        />
      </label>
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2.5 flex size-5 items-center justify-center rounded-control text-text-tertiary hover:bg-surface hover:text-text-primary"
        >
          <X className="size-4" strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/ui/ui.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/search-input.tsx frontend/src/components/ui/ui.test.tsx
git commit -m "feat(frontend): add SearchInput shared component"
```

---

### Task 4: `ProgramsPage` — adopt `PageHeader` and `LoadingState`

**Files:**
- Modify: `frontend/src/routes/ProgramsPage.tsx`
- Test: `frontend/src/features/taxonomy/taxonomy.test.tsx` (existing `ProgramsPage` tests must still pass unmodified — no new test required, this task is a pure refactor verified by the existing suite)

**Interfaces:**
- Consumes: `PageHeader` from `@/components/layout/PageHeader` (Task 1), `LoadingState` from `@/components/layout/LoadingState` (Task 2).

- [ ] **Step 1: Run the existing test to confirm current baseline passes**

Run: `cd frontend && npx vitest run src/features/taxonomy/taxonomy.test.tsx`
Expected: PASS (baseline, before this task's changes)

- [ ] **Step 2: Replace the ad hoc header and loading text**

Edit `frontend/src/routes/ProgramsPage.tsx` — replace the full file body with:

```tsx
import { useState } from "react";
import { ErrorState } from "@/components/layout/ErrorState";
import { EmptyState } from "@/components/layout/EmptyState";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Pagination } from "@/components/layout/Pagination";
import { TaxonomyCard } from "@/features/taxonomy/TaxonomyCard";
import { usePrograms } from "@/features/taxonomy/queries";

export function ProgramsPage() {
  const [page, setPage] = useState(1);
  const { data, isPending, error } = usePrograms(page);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Browse notes" description="Pick a program to start." />

      {isPending ? (
        <LoadingState count={6} />
      ) : error ? (
        <ErrorState error={error} />
      ) : data.items.length === 0 ? (
        <EmptyState title="No programs yet" hint="An administrator needs to add a program first." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((program) => (
              <TaxonomyCard
                key={program.id}
                to={`/programs/${program.id}`}
                code={program.code}
                name={program.name}
                meta={`${program.duration_semesters} semesters`}
              />
            ))}
          </div>
          <Pagination meta={data.pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it still passes**

Run: `cd frontend && npx vitest run src/features/taxonomy/taxonomy.test.tsx`
Expected: PASS — `ProgramsPage` tests still find "B.Tech", "8 semesters", the empty state text, and the error state text, since none of that text changed.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/ProgramsPage.tsx
git commit -m "refactor(frontend): use PageHeader and LoadingState on ProgramsPage"
```

---

### Task 5: `BranchesPage` — adopt `PageHeader` and `LoadingState`

**Files:**
- Modify: `frontend/src/routes/BranchesPage.tsx`
- Test: `frontend/src/features/taxonomy/taxonomy.test.tsx` (existing `BranchesPage` test must still pass)

**Interfaces:**
- Consumes: `PageHeader`, `LoadingState` (Tasks 1-2), existing `Breadcrumbs`.

- [ ] **Step 1: Run the existing test to confirm current baseline passes**

Run: `cd frontend && npx vitest run src/features/taxonomy/taxonomy.test.tsx`
Expected: PASS

- [ ] **Step 2: Replace the ad hoc header and loading text**

Replace the full body of `frontend/src/routes/BranchesPage.tsx`:

```tsx
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Pagination } from "@/components/layout/Pagination";
import { TaxonomyCard } from "@/features/taxonomy/TaxonomyCard";
import { useBranches, useProgram } from "@/features/taxonomy/queries";

export function BranchesPage() {
  const { programId = "" } = useParams();
  const [page, setPage] = useState(1);
  const program = useProgram(programId);
  const branches = useBranches(programId, page);

  if (program.error) return <ErrorState error={program.error} />;
  if (branches.error) return <ErrorState error={branches.error} />;
  if (program.isPending || branches.isPending) return <LoadingState count={6} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Programs", to: "/" }, { label: program.data.name }]} />}
        title={program.data.name}
      />

      {branches.data.items.length === 0 ? (
        <EmptyState title="No branches yet" hint="This program has no branches set up." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {branches.data.items.map((branch) => (
              <TaxonomyCard
                key={branch.id}
                to={`/branches/${branch.id}`}
                code={branch.code}
                name={branch.name}
              />
            ))}
          </div>
          <Pagination meta={branches.data.pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it still passes**

Run: `cd frontend && npx vitest run src/features/taxonomy/taxonomy.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/BranchesPage.tsx
git commit -m "refactor(frontend): use PageHeader and LoadingState on BranchesPage"
```

---

### Task 6: `SubjectsPage` — adopt `PageHeader` and `LoadingState`

**Files:**
- Modify: `frontend/src/routes/SubjectsPage.tsx`
- Test: `frontend/src/features/taxonomy/taxonomy.test.tsx` (existing `SubjectsPage semester filter` tests must still pass — they assert on `screen.getByRole("heading", { name: "Computer Science" })` and on the semester tablist, both preserved below)

**Interfaces:**
- Consumes: `PageHeader`, `LoadingState` (Tasks 1-2), existing `Breadcrumbs`, `cn`.

- [ ] **Step 1: Run the existing test to confirm current baseline passes**

Run: `cd frontend && npx vitest run src/features/taxonomy/taxonomy.test.tsx`
Expected: PASS

- [ ] **Step 2: Replace the ad hoc header and loading text**

Replace the full body of `frontend/src/routes/SubjectsPage.tsx`:

```tsx
import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Pagination } from "@/components/layout/Pagination";
import { TaxonomyCard } from "@/features/taxonomy/TaxonomyCard";
import { useBranch, useProgram, useSubjects } from "@/features/taxonomy/queries";
import { cn } from "@/lib/utils";

export function SubjectsPage() {
  const { branchId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);

  const semesterParam = searchParams.get("semester");
  const semester = semesterParam ? Number(semesterParam) : 1;

  const branchQuery = useBranch(branchId);
  const branch = branchQuery.data;
  const program = useProgram(branch?.program_id ?? "");

  const subjects = useSubjects(branchId, semester, page);

  if (branchQuery.error) return <ErrorState error={branchQuery.error} />;
  if (subjects.error) return <ErrorState error={subjects.error} />;

  const semesterCount = program.data?.duration_semesters ?? 8;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Programs", to: "/" },
              ...(program.data ? [{ label: program.data.name, to: `/programs/${program.data.id}` }] : []),
              { label: branch?.name ?? "Subjects" },
            ]}
          />
        }
        title={branch?.name ?? "Subjects"}
      />

      <div role="tablist" aria-label="Semester" className="flex flex-wrap gap-1">
        {Array.from({ length: semesterCount }, (_, index) => index + 1).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={value === semester}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set("semester", String(value));
              setSearchParams(next, { replace: true });
              setPage(1);
            }}
            className={cn(
              "rounded-control px-2.5 py-1.5 text-ui transition-colors duration-150",
              value === semester ? "bg-surface text-text-primary" : "text-text-muted hover:bg-surface"
            )}
          >
            {value}
          </button>
        ))}
      </div>

      {subjects.isPending ? (
        <LoadingState count={6} />
      ) : subjects.data.items.length === 0 ? (
        <EmptyState title={`No subjects in semester ${semester}`} hint="Try another semester." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.data.items.map((subject) => (
              <TaxonomyCard
                key={subject.id}
                to={`/subjects/${subject.id}`}
                code={subject.code}
                name={subject.name}
                meta={`Semester ${subject.semester}`}
              />
            ))}
          </div>
          <Pagination meta={subjects.data.pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it still passes**

Run: `cd frontend && npx vitest run src/features/taxonomy/taxonomy.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/SubjectsPage.tsx
git commit -m "refactor(frontend): use PageHeader and LoadingState on SubjectsPage"
```

---

### Task 7: `SubjectNotesPage` — adopt `PageHeader`/`LoadingState`, honest empty-state copy

**Files:**
- Modify: `frontend/src/routes/SubjectNotesPage.tsx`
- Test: Create `frontend/src/routes/subject-notes-page.test.tsx` (no existing test file covers this page)

**Interfaces:**
- Consumes: `PageHeader`, `LoadingState` (Tasks 1-2).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/routes/subject-notes-page.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";
import { API, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";
import { SubjectNotesPage } from "@/routes/SubjectNotesPage";

const subject = {
  id: "s1",
  branch_id: "b1",
  code: "CS201",
  name: "Operating Systems",
  semester: 4,
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function paginated<T>(items: T[]) {
  return {
    success: true,
    data: { items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } },
  };
}

describe("SubjectNotesPage", () => {
  it("shows an empty state that acknowledges hidden pending/rejected notes", async () => {
    server.use(
      http.get(`${API}/api/subjects/s1`, () => HttpResponse.json({ success: true, data: subject })),
      http.get(`${API}/api/notes`, () => HttpResponse.json(paginated([])))
    );

    renderWithProviders(
      <Routes>
        <Route path="/subjects/:subjectId" element={<SubjectNotesPage />} />
      </Routes>,
      { route: "/subjects/s1" }
    );

    expect(await screen.findByRole("heading", { name: "Operating Systems" })).toBeInTheDocument();
    expect(screen.getByText(/no approved notes yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/routes/subject-notes-page.test.tsx`
Expected: FAIL — the current empty-state copy is "No notes yet", not "No approved notes yet".

- [ ] **Step 3: Update the page**

Replace the full body of `frontend/src/routes/SubjectNotesPage.tsx`:

```tsx
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Pagination } from "@/components/layout/Pagination";
import { NoteCard } from "@/features/notes/NoteCard";
import { NoteTypeFilter } from "@/features/notes/NoteFilters";
import { useNotes } from "@/features/notes/queries";
import { useBranch, useProgram, useSubject } from "@/features/taxonomy/queries";
import type { NoteType } from "@/lib/api-types";

export function SubjectNotesPage() {
  const { subjectId = "" } = useParams();
  const [page, setPage] = useState(1);
  const [noteType, setNoteType] = useState<NoteType | "">("");

  const subject = useSubject(subjectId);
  const branch = useBranch(subject.data?.branch_id ?? "");
  const program = useProgram(branch.data?.program_id ?? "");

  const notes = useNotes({ subject_id: subjectId, note_type: noteType || undefined, page });

  if (subject.error) return <ErrorState error={subject.error} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Programs", to: "/" },
              ...(program.data ? [{ label: program.data.name, to: `/programs/${program.data.id}` }] : []),
              ...(branch.data ? [{ label: branch.data.name, to: `/branches/${branch.data.id}` }] : []),
              { label: subject.data?.name ?? "Notes" },
            ]}
          />
        }
        title={subject.data?.name ?? "Notes"}
        description={subject.data ? `${subject.data.code} · Semester ${subject.data.semester}` : undefined}
      />

      <NoteTypeFilter
        value={noteType}
        onChange={(value) => {
          setNoteType(value);
          setPage(1);
        }}
      />

      {notes.error ? (
        <ErrorState error={notes.error} />
      ) : notes.isPending ? (
        <LoadingState count={4} />
      ) : notes.data.items.length === 0 ? (
        <EmptyState
          title="No approved notes yet"
          hint="Uploads for this subject are still pending review, or none have been shared yet. Be the first to upload."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {notes.data.items.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
          <Pagination meta={notes.data.pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/routes/subject-notes-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/SubjectNotesPage.tsx frontend/src/routes/subject-notes-page.test.tsx
git commit -m "refactor(frontend): use PageHeader/LoadingState on SubjectNotesPage, honest empty-state copy"
```

---

### Task 8: `SearchPage` — adopt `PageHeader`, `LoadingState`, `SearchInput`

**Files:**
- Modify: `frontend/src/routes/SearchPage.tsx`
- Test: `frontend/src/features/notes/notes.test.tsx` (existing `SearchPage` tests must still pass — they query `screen.getByRole("searchbox")` and `screen.getByRole("heading", { name: /search/i })`, both preserved below)

**Interfaces:**
- Consumes: `PageHeader`, `LoadingState` (Tasks 1-2), `SearchInput` (Task 3).

- [ ] **Step 1: Run the existing test to confirm current baseline passes**

Run: `cd frontend && npx vitest run src/features/notes/notes.test.tsx`
Expected: PASS (SearchPage + NoteDetailPage describe blocks)

- [ ] **Step 2: Replace the header and raw input**

Replace the full body of `frontend/src/routes/SearchPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Pagination } from "@/components/layout/Pagination";
import { SearchInput } from "@/components/ui/search-input";
import { NoteCard } from "@/features/notes/NoteCard";
import { NoteTypeFilter } from "@/features/notes/NoteFilters";
import { useNotes } from "@/features/notes/queries";
import type { NoteType } from "@/lib/api-types";

const SEARCH_DEBOUNCE_MS = 300;

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);

  const q = searchParams.get("q") ?? "";
  const noteType = (searchParams.get("note_type") ?? "") as NoteType | "";

  const [term, setTerm] = useState(q);

  useEffect(() => {
    if (term === q) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (term) next.set("q", term);
      else next.delete("q");
      setSearchParams(next, { replace: true });
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, q, searchParams, setSearchParams]);

  const notes = useNotes({ q: q || undefined, note_type: noteType || undefined, page });

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Search" />

      <div className="flex flex-wrap items-center gap-4">
        <SearchInput value={term} onChange={setTerm} />
        <NoteTypeFilter value={noteType} onChange={(value) => updateParam("note_type", value)} />
      </div>

      {notes.error ? (
        <ErrorState error={notes.error} />
      ) : notes.isPending ? (
        <LoadingState count={4} />
      ) : notes.data.items.length === 0 ? (
        <EmptyState title="No notes matched" hint="Try a different search or filter." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {notes.data.items.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
          <Pagination meta={notes.data.pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it still passes**

Run: `cd frontend && npx vitest run src/features/notes/notes.test.tsx`
Expected: PASS — `SearchInput` renders a `type="search"` input (implicit `searchbox` role) with the same debounced-typing behavior, since `SearchInput` forwards `onChange` exactly as the old raw `<input>` did.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/SearchPage.tsx
git commit -m "refactor(frontend): use PageHeader/LoadingState/SearchInput on SearchPage"
```

---

### Task 9: `NoteDetailPage` — expand metadata, breadcrumb, `LoadingState`

**Files:**
- Modify: `frontend/src/routes/NoteDetailPage.tsx`
- Test: `frontend/src/features/notes/notes.test.tsx` (extend the `NoteDetailPage` describe block)

**Interfaces:**
- Consumes: `PageHeader`, `LoadingState` (Tasks 1-2), existing `Breadcrumbs`, `useSubject`/`useBranch`/`useProgram` from `@/features/taxonomy/queries`.

- [ ] **Step 1: Write the failing test**

The test setup (`frontend/src/test/setup.ts:7`) configures MSW with `onUnhandledRequest: "error"` — any fetch without a matching handler fails the test loudly. `NoteDetailPage` will start calling `useSubject`/`useBranch`/`useProgram` for every note (since `note.data.subject_id` is always real), so the two existing `NoteDetailPage` tests that don't currently stub those routes ("renders the note with its files and download count" and "opens the presigned URL when a file is downloaded") must gain those stubs too, or they will start failing with an unhandled-request error even though nothing about their own assertions is wrong. Add a shared `subject`/`branch`/`program` fixture near the top of `frontend/src/features/notes/notes.test.tsx` (after the existing `file` const) and reuse it in all three `NoteDetailPage` tests that fetch a real note (the 404 test is unaffected — `useSubject` is `enabled: id !== ""` and stays disabled when the note fetch itself 404s, since there is no `subject_id` to read):

```tsx
const subject = {
  id: "s1",
  branch_id: "b1",
  code: "CS201",
  name: "Operating Systems",
  semester: 4,
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const branch = {
  id: "b1",
  program_id: "p1",
  code: "CSE",
  name: "Computer Science",
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const program = {
  id: "p1",
  code: "BTECH",
  name: "B.Tech",
  duration_semesters: 8,
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};
```

Then add these three handlers to the `server.use(...)` call in both the "renders the note with its files and download count" test and the "opens the presigned URL when a file is downloaded" test:

```tsx
http.get(`${API}/api/subjects/s1`, () => HttpResponse.json({ success: true, data: subject })),
http.get(`${API}/api/branches/b1`, () => HttpResponse.json({ success: true, data: branch })),
http.get(`${API}/api/programs/p1`, () => HttpResponse.json({ success: true, data: program })),
```

Finally, add a new `it` block right after the "renders the note with its files and download count" test, reusing the same `subject`/`branch`/`program` fixtures instead of redeclaring them inline:

```tsx
  it("shows the resolved subject/branch/program breadcrumb and note type/exam year", async () => {
    server.use(
      http.get(`${API}/api/notes/n1`, () => HttpResponse.json({ success: true, data: note })),
      http.get(`${API}/api/notes/n1/files`, () => HttpResponse.json({ success: true, data: [file] })),
      http.get(`${API}/api/subjects/s1`, () => HttpResponse.json({ success: true, data: subject })),
      http.get(`${API}/api/branches/b1`, () => HttpResponse.json({ success: true, data: branch })),
      http.get(`${API}/api/programs/p1`, () => HttpResponse.json({ success: true, data: program }))
    );

    renderWithProviders(
      <Routes>
        <Route path="/notes/:noteId" element={<NoteDetailPage />} />
      </Routes>,
      { route: "/notes/n1" }
    );

    expect(await screen.findByRole("link", { name: "Operating Systems" })).toHaveAttribute(
      "href",
      "/subjects/s1"
    );
    expect(screen.getByRole("link", { name: "Computer Science" })).toHaveAttribute("href", "/branches/b1");
    expect(screen.getByText(/lecture notes/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/notes/notes.test.tsx`
Expected: FAIL — the current `NoteDetailPage` renders no breadcrumb links and no note-type text, so `screen.findByRole("link", { name: "Operating Systems" })` never resolves.

- [ ] **Step 3: Update the page**

Replace the full body of `frontend/src/routes/NoteDetailPage.tsx`:

```tsx
import { useParams } from "react-router-dom";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { ErrorState } from "@/components/layout/ErrorState";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusPill } from "@/components/layout/StatusPill";
import { NoteFileList } from "@/features/notes/NoteFileList";
import { useNote, useNoteFiles } from "@/features/notes/queries";
import { useBranch, useProgram, useSubject } from "@/features/taxonomy/queries";
import type { Note } from "@/lib/api-types";

const TYPE_LABELS: Record<Note["note_type"], string> = {
  lecture_notes: "Lecture notes",
  pyq: "Past paper",
  lab_manual: "Lab manual",
  assignment: "Assignment",
  book: "Book",
  other: "Other",
};

export function NoteDetailPage() {
  const { noteId = "" } = useParams();
  const note = useNote(noteId);
  const files = useNoteFiles(noteId);

  const subject = useSubject(note.data?.subject_id ?? "");
  const branch = useBranch(subject.data?.branch_id ?? "");
  const program = useProgram(branch.data?.program_id ?? "");

  if (note.error) return <ErrorState error={note.error} />;
  if (note.isPending) return <LoadingState variant="detail" />;

  return (
    <article className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Programs", to: "/" },
              ...(program.data ? [{ label: program.data.name, to: `/programs/${program.data.id}` }] : []),
              ...(branch.data ? [{ label: branch.data.name, to: `/branches/${branch.data.id}` }] : []),
              ...(subject.data ? [{ label: subject.data.name, to: `/subjects/${subject.data.id}` }] : []),
            ]}
          />
        }
        title={note.data.title}
        description={note.data.description ?? undefined}
        action={<StatusPill status={note.data.status} />}
      />

      <div className="flex flex-wrap items-center gap-2 text-caption text-text-tertiary">
        <span>{TYPE_LABELS[note.data.note_type]}</span>
        {note.data.exam_year && <span>· {note.data.exam_year}</span>}
        <span>· {note.data.download_count} downloads</span>
        <span>· Updated {new Date(note.data.updated_at).toLocaleDateString()}</span>
      </div>

      {note.data.status === "rejected" && note.data.rejection_reason && (
        <p className="rounded-card bg-status-rejected-bg px-3 py-2 text-ui text-status-rejected-fg">
          Rejected: {note.data.rejection_reason}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium">Files</h2>
        {files.error ? (
          <ErrorState error={files.error} />
        ) : files.isPending ? (
          <LoadingState variant="detail" />
        ) : (
          <NoteFileList noteId={noteId} files={files.data} />
        )}
      </section>
    </article>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/notes/notes.test.tsx`
Expected: PASS — including the pre-existing "renders the note with its files and download count" test, since `download_count` text ("3 downloads") is preserved inside the new metadata row.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/NoteDetailPage.tsx frontend/src/features/notes/notes.test.tsx
git commit -m "feat(frontend): expand NoteDetailPage with resolved breadcrumb and full metadata"
```

---

### Task 10: `HomePage` — rebuild around real data

**Files:**
- Modify: `frontend/src/routes/HomePage.tsx`
- Test: Create `frontend/src/routes/home-page.test.tsx`

**Interfaces:**
- Consumes: `usePrograms` from `@/features/taxonomy/queries`, `useNotes` from `@/features/notes/queries`, `TaxonomyCard` from `@/features/taxonomy/TaxonomyCard`, `NoteCard` from `@/features/notes/NoteCard`, `useAuth` from `@/features/auth/useAuth` (existing, unchanged).

This task removes the decorative panel with hardcoded fake content ("Computer Science", "8 semesters", "Operating Systems", "12 notes", "Deadlock Handling — Unit 4", "Approved") that the current `HomePage.tsx` renders as `aria-hidden` decoration — `design.md` §42 ("No Fake UI") forbids invented statistics and content even when marked decorative, since a screenshot or a sighted user still sees fabricated note titles and counts presented as if real. It's replaced with a section built from `usePrograms()` and `useNotes({ status: "approved", limit: 4 })` — both real, already-existing endpoints, so no backend change is required to make this section true.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/routes/home-page.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { API, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";
import { HomePage } from "@/routes/HomePage";

const program = {
  id: "p1",
  code: "BTECH",
  name: "B.Tech",
  duration_semesters: 8,
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const note = {
  id: "n1",
  subject_id: "s1",
  uploader_id: "u1",
  title: "Deadlock Handling — Unit 4",
  description: null,
  note_type: "lecture_notes" as const,
  exam_year: null,
  status: "approved" as const,
  reviewed_by: null,
  reviewed_at: null,
  rejection_reason: null,
  download_count: 12,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function paginated<T>(items: T[]) {
  return {
    success: true,
    data: { items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } },
  };
}

describe("HomePage", () => {
  it("renders real programs and real approved notes, not hardcoded content", async () => {
    server.use(
      http.get(`${API}/api/programs`, () => HttpResponse.json(paginated([program]))),
      http.get(`${API}/api/notes`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("status")).toBe("approved");
        return HttpResponse.json(paginated([note]));
      })
    );

    renderWithProviders(<HomePage />);

    expect(await screen.findByText("B.Tech")).toBeInTheDocument();
    expect(await screen.findByText("Deadlock Handling — Unit 4")).toBeInTheDocument();
    // The old decorative panel hardcoded this exact count next to a fake note —
    // it must not appear as static markup independent of the mocked data.
    expect(screen.queryByText("12 notes")).not.toBeInTheDocument();
  });

  it("shows an empty homepage section gracefully when there are no approved notes yet", async () => {
    server.use(
      http.get(`${API}/api/programs`, () => HttpResponse.json(paginated([program]))),
      http.get(`${API}/api/notes`, () => HttpResponse.json(paginated([])))
    );

    renderWithProviders(<HomePage />);

    expect(await screen.findByText("B.Tech")).toBeInTheDocument();
    expect(await screen.findByText(/no approved notes yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/routes/home-page.test.tsx`
Expected: FAIL — the current `HomePage` never calls `/api/programs` or `/api/notes`, so `screen.findByText("B.Tech")` times out.

- [ ] **Step 3: Rebuild the page**

Replace the full body of `frontend/src/routes/HomePage.tsx`:

```tsx
import { ArrowRight, LayoutGrid, ShieldCheck, Sparkles, Upload as UploadIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/EmptyState";
import { LoadingState } from "@/components/layout/LoadingState";
import { useAuth } from "@/features/auth/useAuth";
import { NoteCard } from "@/features/notes/NoteCard";
import { useNotes } from "@/features/notes/queries";
import { TaxonomyCard } from "@/features/taxonomy/TaxonomyCard";
import { usePrograms } from "@/features/taxonomy/queries";

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

export function HomePage() {
  const { status, user } = useAuth();
  const isAuthenticated = status === "authenticated";

  const programs = usePrograms(1, 3);
  const recentNotes = useNotes({ status: "approved", limit: 4 });

  return (
    <div className="flex flex-col gap-24">
      <section className="flex flex-col gap-6 pt-8">
        <span className="flex items-center gap-1.5 text-caption font-medium text-text-muted">
          <Sparkles className="size-3.5 text-primary" strokeWidth={2} aria-hidden="true" />
          College notes, organized
        </span>
        <h1 className="max-w-2xl text-display font-semibold tracking-tight text-text-primary">
          Find the notes your syllabus already promised you.
        </h1>
        <p className="max-w-lg text-lead text-text-muted">
          Browse by program, branch, and subject, download what you need, and upload what you
          have. Every note is reviewed before it's published.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button asChild size="lg" className="group">
            <Link to="/browse">
              Browse notes
              <ArrowRight
                className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                strokeWidth={2}
                aria-hidden="true"
              />
            </Link>
          </Button>
          {isAuthenticated ? (
            <Button asChild variant="secondary" size="lg">
              <Link to="/upload">Upload a note</Link>
            </Button>
          ) : (
            <Button asChild variant="ghost" size="lg">
              <Link to="/register">Create an account</Link>
            </Button>
          )}
        </div>
        {isAuthenticated && (
          <p className="text-caption text-text-tertiary">
            Welcome back{user?.full_name ? `, ${user.full_name}` : ""}.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-title font-bold text-text-primary">Start with a program</h2>
          <Link to="/browse" className="text-ui font-medium text-primary hover:underline">
            View all programs
          </Link>
        </div>
        {programs.isPending ? (
          <LoadingState count={3} />
        ) : programs.error ? null : programs.data.items.length === 0 ? (
          <EmptyState title="No programs yet" hint="An administrator needs to add a program first." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {programs.data.items.map((program) => (
              <TaxonomyCard
                key={program.id}
                to={`/programs/${program.id}`}
                code={program.code}
                name={program.name}
                meta={`${program.duration_semesters} semesters`}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-8">
        <h2 className="text-title font-bold text-text-primary">Recently approved notes</h2>
        {recentNotes.isPending ? (
          <LoadingState count={4} />
        ) : recentNotes.error ? null : recentNotes.data.items.length === 0 ? (
          <EmptyState
            title="No approved notes yet"
            hint="Be the first to upload notes once you're signed in."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {recentNotes.data.items.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-8">
        <h2 className="text-title font-bold text-text-primary">Everything organized the way class actually works</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="hover:-translate-y-0.5 hover:shadow-floating">
              <span className="flex size-9 items-center justify-center rounded-control bg-accent text-accent-foreground">
                <feature.icon className="size-4" strokeWidth={2} aria-hidden="true" />
              </span>
              <h3 className="text-base font-medium text-text-primary">{feature.title}</h3>
              <p className="text-ui text-text-muted">{feature.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {!isAuthenticated && (
        <section className="flex flex-col items-start gap-4 rounded-panel bg-surface p-10 sm:items-center sm:text-center">
          <h2 className="text-title font-bold text-text-primary">Ready to find your notes?</h2>
          <p className="max-w-md text-ui text-text-muted">
            It takes a minute to sign up, and you can start browsing without one.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link to="/register">Join now</Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="hover:bg-background">
              <Link to="/browse">Just browsing</Link>
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/routes/home-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full frontend test suite to confirm no regressions across all 10 tasks**

Run: `cd frontend && npx vitest run`
Expected: PASS — every test file green, including `taxonomy.test.tsx`, `notes.test.tsx`, `layout.test.tsx`, `ui.test.tsx`, `subject-notes-page.test.tsx`, `home-page.test.tsx`, and every untouched test file elsewhere in the app (auth, upload, admin, moderation).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/HomePage.tsx frontend/src/routes/home-page.test.tsx
git commit -m "feat(frontend): rebuild HomePage around real programs and approved notes"
```

---

## Manual verification (after Task 10)

Per the spec's Testing/Verification section, run the dev server and click through all 7 Discovery pages both logged-out and logged-in as a regular user:

```bash
cd backend && npm run dev &
cd frontend && npm run dev
```

Visit `/`, `/browse`, `/programs/:id`, `/branches/:id`, `/subjects/:id`, `/notes/:id`, `/search` at mobile (375px), tablet (768px), and desktop (1280px) widths. Confirm: real data renders with no console errors, the NoteDetailPage download button triggers a real presigned-URL request, and every loading/empty/error state appears correctly (e.g., search with no query, search with a query matching nothing, visiting a subject with zero approved notes, visiting a nonexistent note id).
