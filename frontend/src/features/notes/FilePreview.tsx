import { AlertCircle, ExternalLink, FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/layout/ErrorState";
import { useFilePreview } from "./queries";
import { previewKindFor } from "./preview-kind";
import type { NoteFile } from "@/lib/api-types";

/**
 * Shows a note's file in the page.
 *
 * The URL is presigned and short-lived, and comes from an endpoint separate
 * from download so that looking at a note does not count as downloading it.
 * Nothing here is rendered as HTML by us — a PDF goes to the browser's own
 * viewer in a sandboxed iframe, an image to <img> — so an uploaded file cannot
 * execute anything against this origin.
 */
export function FilePreview({ noteId, file }: { noteId: string; file: NoteFile }) {
  const preview = useFilePreview(noteId, file.id);
  const kind = previewKindFor(file.mime_type);

  if (kind === "none") {
    return (
      <Unsupported
        filename={file.original_filename}
        mimeType={file.mime_type}
        url={preview.data?.url}
      />
    );
  }

  if (preview.error) return <ErrorState error={preview.error} />;

  if (preview.isPending) {
    return (
      <div
        className="flex h-[28rem] items-center justify-center rounded-card border border-border bg-surface text-ui text-text-muted"
        role="status"
      >
        Loading preview…
      </div>
    );
  }

  const { url } = preview.data;
  const label = `Preview of ${file.original_filename}`;

  return (
    <figure className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        {kind === "image" ? (
          // object-contain, not cover: a scanned page must not be cropped.
          <img src={url} alt={label} className="mx-auto max-h-[36rem] w-auto object-contain" />
        ) : (
          <iframe
            src={url}
            title={label}
            // allow-same-origin is deliberately absent: the document is
            // untrusted user upload and has no business reaching this origin.
            sandbox=""
            className="h-[36rem] w-full border-0 bg-white"
          />
        )}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-caption text-text-tertiary">
        <span className="truncate">{file.original_filename}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          Open in a new tab
          <ExternalLink className="size-3" strokeWidth={2} aria-hidden="true" />
        </a>
      </figcaption>
    </figure>
  );
}

function Unsupported({
  filename,
  mimeType,
  url,
}: {
  filename: string;
  mimeType: string;
  url: string | undefined;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center">
      <FileQuestion className="size-6 text-text-tertiary" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-ui text-text-primary">This file type can&apos;t be shown here</p>
      <p className="max-w-sm text-caption text-text-muted">
        {filename} is a {mimeType} file. Download it to open it in the right application.
      </p>
      {url && (
        <Button asChild variant="secondary" size="sm">
          <a href={url} target="_blank" rel="noopener noreferrer">
            Open anyway
          </a>
        </Button>
      )}
    </div>
  );
}

/** Shown when a note has no uploaded files at all. */
export function NoFilesNotice() {
  return (
    <div className="flex items-center gap-2 rounded-card border border-border bg-surface px-3 py-2.5 text-ui text-text-muted">
      <AlertCircle className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
      No files are attached to this note yet.
    </div>
  );
}
