import { FileStatusPill } from "@/components/layout/StatusPill";
import type { NoteFile } from "@/lib/api-types";
import { useDownloadFile } from "./queries";

function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function NoteFileList({ noteId, files }: { noteId: string; files: NoteFile[] }) {
  const download = useDownloadFile(noteId);

  if (files.length === 0) {
    return <p className="text-ui text-text-muted">No files attached to this note.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {files.map((file) => (
        <li key={file.id} className="flex items-center gap-3 rounded-card bg-surface px-3 py-2.5">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-ui font-medium">{file.original_filename}</span>
            <span className="text-caption text-text-tertiary">{formatSize(file.size_bytes)}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <FileStatusPill status={file.upload_status} />
            <button
              type="button"
              onClick={() => download.mutate(file.id)}
              disabled={download.isPending}
              className="rounded-full bg-accent px-4 py-1.5 text-ui font-medium text-white transition-colors duration-150 disabled:opacity-60"
            >
              {download.isPending ? "Preparing…" : "Download"}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
