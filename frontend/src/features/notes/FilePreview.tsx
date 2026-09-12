import { AlertCircle } from "lucide-react";

/** Shown when a note has no uploaded files at all. */
export function NoFilesNotice() {
  return (
    <div className="flex items-center gap-2 rounded-card border border-border bg-surface px-3 py-2.5 text-ui text-text-muted">
      <AlertCircle className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
      No files are attached to this note yet.
    </div>
  );
}
