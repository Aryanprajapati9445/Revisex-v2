import { Link } from "react-router-dom";
import { StatusPill } from "@/components/layout/StatusPill";
import { TYPE_LABELS } from "@/features/notes/note-labels";
import type { Note } from "@/lib/api-types";

export function NoteCard({ note, showStatus = false }: { note: Note; showStatus?: boolean }) {
  return (
    <Link
      to={`/notes/${note.id}`}
      className="flex flex-col gap-2 rounded-card bg-background p-4 shadow-raised transition-shadow duration-200 hover:shadow-floating"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-base font-medium">{note.title}</span>
        {showStatus && <StatusPill status={note.status} />}
      </div>
      {note.description && <p className="line-clamp-2 text-ui text-text-muted">{note.description}</p>}
      <div className="flex flex-wrap items-center gap-2 text-caption text-text-tertiary">
        <span>{TYPE_LABELS[note.note_type]}</span>
        {note.exam_year && <span>· {note.exam_year}</span>}
        <span>· {note.download_count} downloads</span>
      </div>
    </Link>
  );
}
