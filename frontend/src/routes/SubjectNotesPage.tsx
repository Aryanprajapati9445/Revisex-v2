import { useState } from "react";
import { useParams } from "react-router-dom";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
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

  // Resolved from the subject id alone, so a deep link or a shared URL still
  // names where it is in the hierarchy. Each step feeds the next.
  const subject = useSubject(subjectId);
  const branch = useBranch(subject.data?.branch_id ?? "");
  const program = useProgram(branch.data?.program_id ?? "");

  const notes = useNotes({ subject_id: subjectId, note_type: noteType || undefined, page });

  if (subject.error) return <ErrorState error={subject.error} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Breadcrumbs
          items={[
            { label: "Programs", to: "/" },
            ...(program.data ? [{ label: program.data.name, to: `/programs/${program.data.id}` }] : []),
            ...(branch.data ? [{ label: branch.data.name, to: `/branches/${branch.data.id}` }] : []),
            { label: subject.data?.name ?? "Notes" },
          ]}
        />
        <h1 className="text-title font-bold">{subject.data?.name ?? "Notes"}</h1>
        {subject.data && (
          <p className="text-ui text-text-muted">
            {subject.data.code} · Semester {subject.data.semester}
          </p>
        )}
      </div>

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
        <div className="text-text-muted">Loading notes…</div>
      ) : notes.data.items.length === 0 ? (
        <EmptyState title="No notes yet" hint="Be the first to upload notes for this subject." />
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
