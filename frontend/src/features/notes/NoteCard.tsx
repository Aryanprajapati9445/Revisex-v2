import { MessageSquare, Paperclip } from "lucide-react";
import { Link } from "react-router-dom";
import { StatusPill } from "@/components/layout/StatusPill";
import { BookmarkButton } from "@/features/engagement/BookmarkButton";
import { RatingDisplay } from "@/features/engagement/RatingStars";
import { TYPE_LABELS } from "@/features/notes/note-labels";
import type { NoteCard as NoteCardData } from "@/lib/api-types";

/**
 * One note in a listing.
 *
 * Everything shown comes off the card the API returns — subject, rating,
 * counts, whether this viewer saved it — so a grid of these costs one request
 * rather than one per note for its labels.
 *
 * `showSubject` is off where the surrounding page already says which subject
 * this is (a subject's own note list), and on everywhere else.
 */
export function NoteCard({
  note,
  showStatus = false,
  showSubject = false,
}: {
  note: NoteCardData;
  showStatus?: boolean;
  showSubject?: boolean;
}) {
  return (
    <Link
      to={`/notes/${note.id}`}
      // h-full so cards in a row end level: the grid stretches its items, but
      // without this the link inside only grows to its own content and a short
      // card sits visibly higher than a long one beside it.
      className="group flex h-full flex-col gap-2 rounded-card border border-border bg-background p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-floating focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-base font-medium text-text-primary">{note.title}</span>
        <div className="flex shrink-0 items-center gap-1">
          {showStatus && <StatusPill status={note.status} />}
          <BookmarkButton noteId={note.id} saved={note.viewer_bookmarked === true} variant="icon" />
        </div>
      </div>

      {showSubject && (
        <span className="text-caption text-text-muted">
          {note.subject_name} · Semester {note.semester}
        </span>
      )}

      {note.description && (
        <p className="line-clamp-2 text-ui text-text-muted">{note.description}</p>
      )}

      {note.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {note.tags.slice(0, 3).map((tag) => (
            <li
              key={tag}
              className="rounded-control bg-surface px-1.5 py-0.5 text-caption text-text-tertiary"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-caption text-text-tertiary">
        <span>{TYPE_LABELS[note.note_type]}</span>
        {note.exam_year && <span>· {note.exam_year}</span>}
        <RatingDisplay average={note.rating_avg} count={note.rating_count} className="ml-auto" />
        {note.comment_count > 0 && (
          <span
            className="inline-flex items-center gap-1"
            aria-label={`${note.comment_count} comments`}
          >
            <MessageSquare className="size-3" strokeWidth={2} aria-hidden="true" />
            {note.comment_count}
          </span>
        )}
        <span className="inline-flex items-center gap-1" aria-label={`${note.download_count} downloads`}>
          <Paperclip className="size-3" strokeWidth={2} aria-hidden="true" />
          {note.download_count}
        </span>
      </div>
    </Link>
  );
}
