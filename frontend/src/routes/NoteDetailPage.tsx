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
