import { useState } from "react";
import { Eye } from "lucide-react";
import { FileStatusPill } from "@/components/layout/StatusPill";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/format";
import type { NoteFile } from "@/lib/api-types";
import { FilePreviewDialog } from "./FilePreviewDialog";
import { useDownloadFile } from "./queries";

export function NoteFileList({ noteId, files }: { noteId: string; files: NoteFile[] }) {
  const download = useDownloadFile(noteId);
  const [previewFile, setPreviewFile] = useState<NoteFile | null>(null);

  if (files.length === 0) {
    return <p className="text-ui text-text-muted">No files attached to this note.</p>;
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {files.map((file) => (
          <li key={file.id} className="flex items-center gap-3 rounded-card bg-surface px-3 py-2.5">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-ui font-medium">{file.original_filename}</span>
              <span className="text-caption text-text-tertiary">
                {formatFileSize(file.size_bytes)} · {file.mime_type}
                {file.page_count !== null && <> · {file.page_count} pages</>}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <FileStatusPill status={file.upload_status} />
              <Button type="button" variant="outline" size="icon-sm" aria-label="Preview" onClick={() => setPreviewFile(file)}>
                <Eye />
              </Button>
              <Button type="button" size="sm" onClick={() => download.mutate(file.id)} disabled={download.isPending}>
                {download.isPending ? "Preparing…" : "Download"}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <FilePreviewDialog
        noteId={noteId}
        file={previewFile}
        open={previewFile !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewFile(null);
        }}
        onDownload={() => {
          if (previewFile) download.mutate(previewFile.id);
        }}
      />
    </>
  );
}
