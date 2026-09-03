import { useParams } from "react-router-dom";
import { ErrorState } from "@/components/layout/ErrorState";
import { StatusPill } from "@/components/layout/StatusPill";
import { NoteFileList } from "@/features/notes/NoteFileList";
import { useNote, useNoteFiles } from "@/features/notes/queries";

export function NoteDetailPage() {
  const { noteId = "" } = useParams();
  const note = useNote(noteId);
  const files = useNoteFiles(noteId);

  if (note.error) return <ErrorState error={note.error} />;
  if (note.isPending) return <div className="text-text-muted">Loading note…</div>;

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-title font-bold">{note.data.title}</h1>
          <StatusPill status={note.data.status} />
        </div>
        {note.data.description && <p className="text-lead text-text-muted">{note.data.description}</p>}
        <p className="text-caption text-text-tertiary">{note.data.download_count} downloads</p>
        {note.data.status === "rejected" && note.data.rejection_reason && (
          <p className="rounded-card bg-status-rejected-bg px-3 py-2 text-ui text-status-rejected-fg">
            Rejected: {note.data.rejection_reason}
          </p>
        )}
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium">Files</h2>
        {files.error ? (
          <ErrorState error={files.error} />
        ) : files.isPending ? (
          <p className="text-ui text-text-muted">Loading files…</p>
        ) : (
          <NoteFileList noteId={noteId} files={files.data} />
        )}
      </section>
    </article>
  );
}
