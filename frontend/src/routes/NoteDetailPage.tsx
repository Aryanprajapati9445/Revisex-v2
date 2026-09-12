import { Download, Tag as TagIcon } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { ErrorState } from "@/components/layout/ErrorState";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusPill } from "@/components/layout/StatusPill";
import { Reveal } from "@/components/motion/Reveal";
import { BookmarkButton } from "@/features/engagement/BookmarkButton";
import { CommentThread } from "@/features/engagement/CommentThread";
import { RatingDisplay, RatingInput } from "@/features/engagement/RatingStars";
import { useRateNote } from "@/features/engagement/queries";
import { useAuth } from "@/features/auth/useAuth";
import { NoFilesNotice } from "@/features/notes/FilePreview";
import { NoteFileList } from "@/features/notes/NoteFileList";
import { TYPE_LABELS } from "@/features/notes/note-labels";
import { useNote, useNoteFiles } from "@/features/notes/queries";

export function NoteDetailPage() {
  const { noteId = "" } = useParams();
  const { user } = useAuth();
  const note = useNote(noteId);
  const files = useNoteFiles(noteId);
  const rate = useRateNote(noteId);

  if (note.error) return <ErrorState error={note.error} />;
  if (note.isPending) return <LoadingState variant="detail" />;

  const data = note.data;
  const isOwnUpload = user !== null && data.uploader_id === user.id;

  return (
    <Reveal>
      <article className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={
            // Every level comes back on the note itself now, so the trail draws
            // immediately instead of after three chained requests.
            <Breadcrumbs
              items={[
                { label: "Programs", to: "/browse" },
                { label: data.program_name, to: `/programs/${data.program_id}` },
                { label: data.branch_name, to: `/branches/${data.branch_id}` },
                { label: data.subject_name, to: `/subjects/${data.subject_id}` },
              ]}
            />
          }
          title={data.title}
          description={data.description ?? undefined}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {data.status !== "approved" && <StatusPill status={data.status} />}
              <BookmarkButton noteId={data.id} saved={data.viewer_bookmarked === true} />
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption text-text-tertiary">
          <span className="text-text-muted">{TYPE_LABELS[data.note_type]}</span>
          {data.exam_year && <span>· {data.exam_year}</span>}
          <span>· Semester {data.semester}</span>
          <span>· {data.subject_code}</span>
          {data.uploader_name && <span>· Shared by {data.uploader_name}</span>}
          <span>· {data.download_count} downloads</span>
          <RatingDisplay average={data.rating_avg} count={data.rating_count} className="ml-1" />
        </div>

        {data.tags.length > 0 && (
          <ul className="flex flex-wrap items-center gap-1.5">
            <TagIcon className="size-3.5 text-text-tertiary" strokeWidth={2} aria-hidden="true" />
            {data.tags.map((tag) => (
              <li key={tag}>
                <Link
                  to={`/search?tag=${encodeURIComponent(tag)}`}
                  className="rounded-control bg-surface px-2 py-0.5 text-caption text-text-muted transition-colors duration-150 hover:bg-accent hover:text-text-primary"
                >
                  {tag}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {data.status === "rejected" && data.rejection_reason && (
          <p className="rounded-card bg-status-rejected-bg px-3 py-2 text-ui text-status-rejected-fg">
            Rejected: {data.rejection_reason}
          </p>
        )}

        <section className="flex flex-col gap-3" aria-labelledby="files-heading">
          <h2 id="files-heading" className="text-base font-medium text-text-primary">
            Files
          </h2>

          {files.error ? (
            <ErrorState error={files.error} />
          ) : files.isPending ? (
            <LoadingState variant="detail" />
          ) : files.data.length === 0 ? (
            <NoFilesNotice />
          ) : (
            <NoteFileList noteId={noteId} files={files.data} />
          )}
        </section>

        {data.status === "approved" && (
          <section className="flex flex-col gap-2 rounded-panel border border-border bg-surface p-4">
            <h2 className="text-base font-medium text-text-primary">Were these useful?</h2>
            <RatingInput
              value={data.viewer_rating}
              disabled={isOwnUpload || user === null}
              disabledReason={
                isOwnUpload
                  ? "You uploaded this note, so you can't rate it."
                  : "Log in to rate this note."
              }
              onRate={(rating) => rate.mutate(rating)}
            />
            {rate.error && <ErrorState error={rate.error} />}
          </section>
        )}

        {data.status === "approved" && <CommentThread noteId={noteId} />}

        {files.data && files.data.length > 0 && (
          <p className="flex items-center gap-1.5 text-caption text-text-tertiary">
            <Download className="size-3.5" strokeWidth={2} aria-hidden="true" />
            Viewing a note doesn&apos;t count as a download — only the download button does.
          </p>
        )}
      </article>
    </Reveal>
  );
}
