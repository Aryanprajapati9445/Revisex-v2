import { useEffect, useState } from "react";
import { AlertTriangle, FileQuestion, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-client";
import { PREVIEW_MAX_BYTES } from "@/lib/constants";
import { formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NoteFile } from "@/lib/api-types";
import { usePreviewFile } from "./queries";

function isPreviewableImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

function isPreviewablePdf(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

/** Same icon-in-a-circle idiom as EmptyState/ErrorState, reused here so a
 * dead-end inside the dialog (too large, unsupported type, failed to load)
 * reads as the same kind of message as everywhere else in the app. */
function DialogState({
  icon: Icon,
  title,
  hint,
  spin = false,
}: {
  icon: typeof AlertTriangle;
  title: string;
  hint?: string;
  spin?: boolean;
}) {
  return (
    <div role={spin ? "status" : "alert"} className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface text-text-tertiary shadow-raised">
        <Icon className={cn("size-5", spin && "animate-spin")} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <p className="text-base font-medium">{title}</p>
      {hint && <p className="mt-1 text-ui text-text-muted">{hint}</p>}
    </div>
  );
}

export function FilePreviewDialog({
  noteId,
  file,
  open,
  onOpenChange,
  onDownload,
}: {
  noteId: string;
  file: NoteFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload: () => void;
}) {
  const preview = usePreviewFile(noteId);
  const [imageFailed, setImageFailed] = useState(false);

  const tooLarge = file?.size_bytes !== null && (file?.size_bytes ?? 0) > PREVIEW_MAX_BYTES;
  const previewable = !!file && (isPreviewableImage(file.mime_type) || isPreviewablePdf(file.mime_type));

  // Only fetch the presigned URL for a file we can actually render, and
  // never for one over the size gate — no point spending a request (or, for
  // an image, forcing the browser to decode a huge one) on a preview we're
  // not going to show.
  useEffect(() => {
    if (open && file && previewable && !tooLarge) {
      setImageFailed(false);
      preview.mutate(file.id);
    }
    if (!open) preview.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, file?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">{file?.original_filename}</DialogTitle>
        </DialogHeader>

        <div className="min-h-[50vh] overflow-hidden rounded-card bg-background">
          {!file ? null : tooLarge ? (
            <DialogState
              icon={AlertTriangle}
              title="Too large to preview"
              hint={`This file is ${formatFileSize(file.size_bytes)}, over the ${formatFileSize(PREVIEW_MAX_BYTES)} preview limit. Download it to view it.`}
            />
          ) : !previewable ? (
            <DialogState
              icon={FileQuestion}
              title="No preview available"
              hint={`Files of type "${file.mime_type}" can't be previewed in-app yet.`}
            />
          ) : preview.isPending || preview.isIdle ? (
            <DialogState icon={Loader2} title="Loading preview…" spin />
          ) : preview.isError ? (
            <DialogState
              icon={AlertTriangle}
              title="Couldn't load preview"
              hint={preview.error instanceof ApiError ? preview.error.message : "Please try again."}
            />
          ) : isPreviewablePdf(file.mime_type) ? (
            <iframe
              src={preview.data.url}
              title={file.original_filename}
              className="h-[70vh] w-full border-0"
            />
          ) : imageFailed ? (
            <DialogState icon={AlertTriangle} title="Couldn't load preview" hint="Please try again." />
          ) : (
            <img
              src={preview.data.url}
              alt={file.original_filename}
              loading="lazy"
              decoding="async"
              className="mx-auto max-h-[70vh] w-auto object-contain"
              onError={() => setImageFailed(true)}
            />
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={onDownload}>
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
