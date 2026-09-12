import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/useAuth";
import type { NoteComment } from "@/lib/api-types";
import { useCommentMutations, useComments } from "./queries";

const MAX_LENGTH = 2000;

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function CommentThread({ noteId }: { noteId: string }) {
  const { user, status } = useAuth();
  const comments = useComments(noteId);
  const { create, update, remove } = useCommentMutations(noteId);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    create.mutate(body, { onSuccess: () => setDraft("") });
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="discussion-heading">
      <h2 id="discussion-heading" className="text-base font-medium text-text-primary">
        Discussion
        {comments.data && comments.data.pagination.total > 0 && (
          <span className="ml-2 text-caption font-normal text-text-tertiary">
            {comments.data.pagination.total}
          </span>
        )}
      </h2>

      {status === "authenticated" ? (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <label htmlFor="comment-body" className="sr-only">
            Add a comment
          </label>
          <Textarea
            id="comment-body"
            value={draft}
            maxLength={MAX_LENGTH}
            rows={3}
            placeholder="Ask a question, or say what was useful about these notes."
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-caption text-text-tertiary">
              {draft.length > MAX_LENGTH - 200 && `${MAX_LENGTH - draft.length} characters left`}
            </span>
            <Button type="submit" size="sm" disabled={!draft.trim() || create.isPending}>
              {create.isPending ? "Posting…" : "Post"}
            </Button>
          </div>
          {create.error && <ErrorState error={create.error} />}
        </form>
      ) : (
        <p className="rounded-card bg-surface px-3 py-2.5 text-ui text-text-muted">
          <Link to="/login" className="text-primary hover:underline">
            Log in
          </Link>{" "}
          to join the discussion.
        </p>
      )}

      {comments.error ? (
        <ErrorState error={comments.error} />
      ) : comments.isPending ? (
        <p className="text-ui text-text-muted">Loading discussion…</p>
      ) : comments.data.items.length === 0 ? (
        <EmptyState title="No comments yet" hint="Be the first to say something about these notes." />
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.data.items.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              isMine={user !== null && comment.user_id === user.id}
              isEditing={editingId === comment.id}
              onEdit={() => setEditingId(comment.id)}
              onCancelEdit={() => setEditingId(null)}
              onSave={(body) => update.mutate({ id: comment.id, body }, { onSuccess: () => setEditingId(null) })}
              onDelete={() => remove.mutate(comment.id)}
              busy={update.isPending || remove.isPending}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentRow({
  comment,
  isMine,
  isEditing,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
  busy,
}: {
  comment: NoteComment;
  isMine: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (body: string) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [body, setBody] = useState(comment.body);

  return (
    <li className="flex flex-col gap-1.5 rounded-card border border-border bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-caption text-text-tertiary">
        {/* Null when the account is gone — comments outlive their authors. */}
        <span className="font-medium text-text-primary">
          {comment.author_name ?? "Former member"}
        </span>
        <span>· {formatWhen(comment.created_at)}</span>
        {comment.edited && <span>· edited</span>}
      </div>

      {isEditing ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`edit-${comment.id}`} className="sr-only">
            Edit your comment
          </label>
          <Textarea
            id={`edit-${comment.id}`}
            value={body}
            rows={3}
            maxLength={MAX_LENGTH}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={!body.trim() || busy} onClick={() => onSave(body.trim())}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-ui text-text-primary">{comment.body}</p>
      )}

      {isMine && !isEditing && (
        <div className="flex gap-3 text-caption">
          <button type="button" onClick={onEdit} className="text-text-muted underline hover:text-text-primary">
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="text-text-muted underline hover:text-status-rejected-fg"
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}
