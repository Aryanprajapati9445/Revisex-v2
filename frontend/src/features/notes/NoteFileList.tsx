import { Download, Eye, FileText, Image as ImageIcon, File as FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NoteFile } from "@/lib/api-types";
import { useDownloadFile } from "./queries";
import { canPreview, formatSize, previewKindFor } from "./preview-kind";

function FileGlyph({ mimeType }: { mimeType: string }) {
  const kind = previewKindFor(mimeType);
  const Icon = kind === "image" ? ImageIcon : kind === "none" ? FileIcon : FileText;
  return <Icon className="size-4 shrink-0 text-text-tertiary" strokeWidth={2} aria-hidden="true" />;
}

/**
 * The files on a note, and which one the viewer is looking at.
 *
 * Selection is controlled by the page rather than held here, because the
 * preview pane sits outside this list — clicking a row has to move something
 * the list does not own.
 */
export function NoteFileList({
  noteId,
  files,
  selectedId,
  onSelect,
}: {
  noteId: string;
  files: NoteFile[];
  selectedId?: string | null;
  onSelect?: (fileId: string) => void;
}) {
  const download = useDownloadFile(noteId);

  if (files.length === 0) {
    return <p className="text-ui text-text-muted">No files attached to this note.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {files.map((file) => {
        const isSelected = file.id === selectedId;
        const previewable = canPreview(file.mime_type);

        return (
          <li
            key={file.id}
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-card border px-3 py-2.5 transition-colors duration-150",
              isSelected ? "border-primary bg-accent" : "border-border bg-surface"
            )}
          >
            <FileGlyph mimeType={file.mime_type} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-ui font-medium text-text-primary">
                {file.original_filename}
              </span>
              <span className="text-caption text-text-tertiary">
                {formatSize(file.size_bytes)}
                {file.page_count !== null && <> · {file.page_count} pages</>}
                {!previewable && <> · preview not available</>}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {previewable && onSelect && (
                <Button
                  type="button"
                  size="sm"
                  variant={isSelected ? "secondary" : "ghost"}
                  onClick={() => onSelect(file.id)}
                  aria-pressed={isSelected}
                >
                  <Eye className="size-3.5" strokeWidth={2} aria-hidden="true" />
                  {isSelected ? "Viewing" : "View"}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => download.mutate(file.id)}
                disabled={download.isPending}
              >
                <Download className="size-3.5" strokeWidth={2} aria-hidden="true" />
                {download.isPending ? "Preparing…" : "Download"}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
