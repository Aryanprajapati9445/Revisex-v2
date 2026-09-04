import { useState } from "react";
import { useParams } from "react-router-dom";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Pagination } from "@/components/layout/Pagination";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { NoteCard } from "@/features/notes/NoteCard";
import { NoteTypeFilter } from "@/features/notes/NoteFilters";
import { useNotes } from "@/features/notes/queries";
import { useBranch, useProgram, useSubject } from "@/features/taxonomy/queries";
import type { NoteType } from "@/lib/api-types";

export function SubjectNotesPage() {
  const { subjectId = "" } = useParams();
  const [page, setPage] = useState(1);
  const [noteType, setNoteType] = useState<NoteType | "">("");

  // Resolved from the subject id alone, so a deep link or a shared URL still
  // names where it is in the hierarchy. Each step feeds the next.
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
              { label: "Programs", to: "/browse" },
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
