import { Bookmark } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Pagination } from "@/components/layout/Pagination";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { Button } from "@/components/ui/button";
import { useBookmarks } from "@/features/engagement/queries";
import { NoteCard } from "@/features/notes/NoteCard";

export function SavedPage() {
  const [page, setPage] = useState(1);
  const saved = useBookmarks(page);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Saved notes"
        description="Notes you've kept for later, most recently saved first."
      />

      {saved.error ? (
        <ErrorState error={saved.error} />
      ) : saved.isPending ? (
        <LoadingState count={4} />
      ) : saved.data.items.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          hint="Use the bookmark icon on any note to keep it here."
          action={
            <Button asChild>
              <Link to="/browse">
                <Bookmark className="size-4" strokeWidth={2} aria-hidden="true" />
                Find notes to save
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <Stagger className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {saved.data.items.map((note) => (
              <StaggerItem key={note.id}>
                <NoteCard note={note} showSubject />
              </StaggerItem>
            ))}
          </Stagger>
          <Pagination meta={saved.data.pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
