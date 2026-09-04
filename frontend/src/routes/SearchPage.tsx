import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Pagination } from "@/components/layout/Pagination";
import { SearchInput } from "@/components/ui/search-input";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { NoteCard } from "@/features/notes/NoteCard";
import { NoteTypeFilter } from "@/features/notes/NoteFilters";
import { useNotes } from "@/features/notes/queries";
import type { NoteType } from "@/lib/api-types";

/** Long enough to swallow a burst of typing, short enough to feel immediate. */
const SEARCH_DEBOUNCE_MS = 300;

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);

  const q = searchParams.get("q") ?? "";
  const noteType = (searchParams.get("note_type") ?? "") as NoteType | "";

  // The field is driven locally and the URL follows once typing settles. Each
  // distinct term is a Postgres full-text query, so writing the param on every
  // keystroke issued one request per character. The query itself still reads
  // `q` from the URL, so debouncing the write debounces the fetch.
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
          <Stagger className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {notes.data.items.map((note) => (
              <StaggerItem key={note.id}>
                <NoteCard note={note} />
              </StaggerItem>
            ))}
          </Stagger>
          <Pagination meta={notes.data.pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
