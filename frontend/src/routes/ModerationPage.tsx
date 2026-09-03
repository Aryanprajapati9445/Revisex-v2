import { useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { Pagination } from "@/components/layout/Pagination";
import { ReviewDialog } from "@/features/moderation/ReviewDialog";
import { useReviewNote } from "@/features/moderation/queries";
import { useNotes } from "@/features/notes/queries";
import { queryKeys } from "@/lib/query-keys";

export function ModerationPage() {
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<{ id: string; title: string } | null>(null);

  // The backend scopes a pending query to the admin's own branch or program,
  // so no client-side scope filter is needed — or trustworthy.
  const filters = { status: "pending" as const, page };
  const notes = useNotes(filters);
  const review = useReviewNote(queryKeys.notes(filters));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-title font-bold">Moderation queue</h1>
        <p className="mt-1 text-lead text-text-muted">Notes awaiting review in your scope.</p>
      </div>

      {notes.error ? (
        <ErrorState error={notes.error} />
      ) : notes.isPending ? (
        <div className="text-text-muted">Loading queue…</div>
      ) : notes.data.items.length === 0 ? (
        <EmptyState title="Queue is empty" hint="Nothing is waiting for review right now." />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {notes.data.items.map((note) => (
              <li key={note.id} className="flex items-center gap-4 rounded-card bg-background p-4 shadow-raised">
                <div className="flex min-w-0 flex-col">
                  <Link to={`/notes/${note.id}`} className="truncate text-base font-medium hover:underline">
                    {note.title}
                  </Link>
                  {note.description && <p className="truncate text-ui text-text-muted">{note.description}</p>}
                </div>
                <div className="ml-auto flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setRejecting({ id: note.id, title: note.title })}
                    className="rounded-control bg-surface px-2.5 py-1.5 text-ui transition-colors duration-150 hover:bg-status-rejected-bg"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => review.mutate({ noteId: note.id, decision: "approved" })}
                    disabled={review.isPending}
                    className="rounded-full bg-accent px-4 py-1.5 text-ui font-medium text-white transition-colors duration-150 disabled:opacity-60"
                  >
                    Approve
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <Pagination meta={notes.data.pagination} onPageChange={setPage} />
        </>
      )}

      {rejecting && (
        <ReviewDialog
          noteTitle={rejecting.title}
          pending={review.isPending}
          onCancel={() => setRejecting(null)}
          onConfirm={(reason) => {
            review.mutate(
              { noteId: rejecting.id, decision: "rejected", rejection_reason: reason },
              { onSettled: () => setRejecting(null) }
            );
          }}
        />
      )}
    </div>
  );
}
