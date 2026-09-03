import { useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { Pagination } from "@/components/layout/Pagination";
import { Button } from "@/components/ui/button";
import { NoteCard } from "@/features/notes/NoteCard";
import { useNotes } from "@/features/notes/queries";
import type { NoteStatus } from "@/lib/api-types";
import { cn } from "@/lib/utils";

const TABS: { value: NoteStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export function MyUploadsPage() {
  const [status, setStatus] = useState<NoteStatus>("pending");
  const [page, setPage] = useState(1);

  // For a non-admin the backend narrows any non-approved status query to the
  // caller's own uploads, so this is already "mine" without an extra filter.
  const notes = useNotes({ status, page });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-title font-bold">My uploads</h1>
        <Button asChild>
          <Link to="/upload">Upload</Link>
        </Button>
      </div>

      <div role="tablist" aria-label="Upload status" className="flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={tab.value === status}
            onClick={() => {
              setStatus(tab.value);
              setPage(1);
            }}
            className={cn(
              "rounded-control px-2.5 py-1.5 text-ui transition-colors duration-150",
              tab.value === status ? "bg-surface text-text-primary" : "text-text-muted hover:bg-surface"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {notes.error ? (
        <ErrorState error={notes.error} />
      ) : notes.isPending ? (
        <div className="text-text-muted">Loading…</div>
      ) : notes.data.items.length === 0 ? (
        <EmptyState title={`Nothing ${status}`} hint="Uploads you submit show up here." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {notes.data.items.map((note) => (
              <NoteCard key={note.id} note={note} showStatus />
            ))}
          </div>
          <Pagination meta={notes.data.pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
