import { SlidersHorizontal, X } from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Pagination } from "@/components/layout/Pagination";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { NoteCard } from "@/features/notes/NoteCard";
import { NoteTypeFilter } from "@/features/notes/NoteFilters";
import { useNotes } from "@/features/notes/queries";
import { useBranches, usePrograms, useSubjects } from "@/features/taxonomy/queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { Note, NoteType } from "@/lib/api-types";
import { PICKER_LIMIT } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const selectClass = "rounded-control bg-surface px-2.5 py-1.5 text-ui text-text-primary outline-none disabled:opacity-50";

/**
 * memo: the grid re-renders on every debounced keystroke and every filter
 * change, and a card is a non-trivial subtree. `note` is a stable object from
 * the query cache, so unchanged rows skip re-rendering entirely.
 */
const MemoNoteCard = memo(function MemoNoteCard({ note }: { note: Note }) {
  return <NoteCard note={note} />;
});

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);

  const q = searchParams.get("q") ?? "";
  const noteType = (searchParams.get("note_type") ?? "") as NoteType | "";
  const programId = searchParams.get("program") ?? "";
  const branchId = searchParams.get("branch") ?? "";
  const subjectId = searchParams.get("subject") ?? "";

  // The field is driven locally and the URL follows once typing settles. Each
  // distinct term is a Postgres full-text query, so writing the param on every
  // keystroke issued one request per character. The query itself still reads
  // `q` from the URL, so debouncing the write debounces the fetch.
  const [term, setTerm] = useState(q);
  const debouncedTerm = useDebouncedValue(term, 300);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(updates)) {
            if (value === null || value === "") next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true }
      );
      // Reset paging in the event that narrowed the query, not in an effect
      // watching the URL: a narrower search usually has fewer pages.
      setPage(1);
    },
    [setSearchParams]
  );

  useEffect(() => {
    if (debouncedTerm !== q) updateParams({ q: debouncedTerm || null });
  }, [debouncedTerm, q, updateParams]);

  const [filtersOpen, setFiltersOpen] = useState(programId !== "" || subjectId !== "");

  // The notes API filters by subject_id alone, so program and branch are the
  // path to one rather than filters in their own right — each narrows the next
  // picker until a subject can be named.
  const programs = usePrograms(1, PICKER_LIMIT);
  const branches = useBranches(programId, 1, PICKER_LIMIT);
  const subjects = useSubjects(branchId, undefined, 1, PICKER_LIMIT);

  const notes = useNotes({
    q: q || undefined,
    note_type: noteType || undefined,
    subject_id: subjectId || undefined,
    page,
  });

  const anyFilter = noteType !== "" || programId !== "" || branchId !== "" || subjectId !== "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Search" description="Find a note by name, or narrow to a single subject." />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={term} onChange={setTerm} className="max-w-md" />
          <NoteTypeFilter value={noteType} onChange={(value) => updateParams({ note_type: value })} />
          <Button
            type="button"
            variant={filtersOpen ? "secondary" : "ghost"}
            size="sm"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal className="size-3.5" strokeWidth={2} aria-hidden="true" />
            Course filters
          </Button>
          {anyFilter && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                updateParams({ note_type: null, program: null, branch: null, subject: null })
              }
            >
              <X className="size-3.5" strokeWidth={2} aria-hidden="true" />
              Clear
            </Button>
          )}
        </div>

        {filtersOpen && (
          <div className="grid grid-cols-1 gap-3 rounded-card bg-surface p-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-caption text-text-muted">Program</span>
              <select
                className={selectClass}
                value={programId}
                onChange={(event) =>
                  updateParams({ program: event.target.value, branch: null, subject: null })
                }
              >
                <option value="">Any program</option>
                {programs.data?.items.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.code} — {program.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-caption text-text-muted">Branch</span>
              <select
                className={selectClass}
                disabled={programId === ""}
                value={branchId}
                onChange={(event) => updateParams({ branch: event.target.value, subject: null })}
              >
                <option value="">{programId ? "Any branch" : "Pick a program first"}</option>
                {branches.data?.items.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.code} — {branch.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-caption text-text-muted">Subject</span>
              <select
                className={selectClass}
                disabled={branchId === ""}
                value={subjectId}
                onChange={(event) => updateParams({ subject: event.target.value })}
              >
                <option value="">{branchId ? "Any subject" : "Pick a branch first"}</option>
                {subjects.data?.items.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.code} — {subject.name} (sem {subject.semester})
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {notes.error ? (
        <ErrorState error={notes.error} />
      ) : notes.isPending ? (
        <LoadingState count={4} />
      ) : notes.data.items.length === 0 ? (
        <EmptyState title="No notes matched" hint="Try a different search or filter." />
      ) : (
        <>
          <p aria-live="polite" className="text-caption text-text-tertiary">
            {notes.data.pagination.total} result{notes.data.pagination.total === 1 ? "" : "s"}
          </p>
          <Stagger
            className={cn(
              "grid grid-cols-1 gap-4 transition-opacity duration-150 md:grid-cols-2",
              // keepPreviousData holds the previous results on screen while the
              // next page loads; dimming says "this is still the old answer"
              // without collapsing the layout.
              notes.isFetching && "opacity-60"
            )}
          >
            {notes.data.items.map((note) => (
              <StaggerItem key={note.id}>
                <MemoNoteCard note={note} />
              </StaggerItem>
            ))}
          </Stagger>
          <Pagination meta={notes.data.pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
