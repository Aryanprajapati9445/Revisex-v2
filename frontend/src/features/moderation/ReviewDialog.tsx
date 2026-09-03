import { useState, type FormEvent } from "react";

export function ReviewDialog({
  noteTitle,
  onCancel,
  onConfirm,
  pending,
}: {
  noteTitle: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // The DB's notes_review_consistency CHECK rejects a blank reason, so catch
    // it here and give the admin a useful message instead of a 422.
    if (reason.trim() === "") {
      setError("A reason is required so the uploader knows what to fix.");
      return;
    }
    onConfirm(reason.trim());
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-label={`Reject ${noteTitle}`} className="w-full max-w-md rounded-panel bg-background p-6 shadow-floating">
        <h2 className="text-base font-medium">Reject “{noteTitle}”</h2>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-caption text-text-muted">Reason</span>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(null);
              }}
              className="rounded-control bg-surface px-2.5 py-1.5 text-ui outline-none"
            />
          </label>

          {error && (
            <p role="alert" className="text-caption text-status-rejected-fg">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded-control px-2.5 py-1.5 text-ui text-text-muted hover:bg-surface">
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-accent px-4 py-2 text-ui font-medium text-white transition-colors duration-150 disabled:opacity-60"
            >
              {pending ? "Rejecting…" : "Confirm rejection"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
