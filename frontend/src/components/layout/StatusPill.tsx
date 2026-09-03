import { cn } from "@/lib/utils";
import type { FileUploadStatus, NoteStatus } from "@/lib/api-types";

const NOTE_LABELS: Record<NoteStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
};

const FILE_LABELS: Record<FileUploadStatus, string> = {
  pending: "Uploading",
  uploaded: "Uploaded",
  failed: "Failed",
};

// Tinted background + darker text of the same hue, 4px radius — the idiom from
// the product screenshot in Notion's hero, not saturated badges.
const TONE: Record<string, string> = {
  pending: "bg-status-pending-bg text-status-pending-fg",
  uploading: "bg-status-pending-bg text-status-pending-fg",
  approved: "bg-status-approved-bg text-status-approved-fg",
  uploaded: "bg-status-approved-bg text-status-approved-fg",
  rejected: "bg-status-rejected-bg text-status-rejected-fg",
  failed: "bg-status-rejected-bg text-status-rejected-fg",
};

export function StatusPill({ status }: { status: NoteStatus }) {
  return (
    <span className={cn("rounded-control px-1.5 py-0.5 text-caption font-medium", TONE[status])}>
      {NOTE_LABELS[status]}
    </span>
  );
}

export function FileStatusPill({ status }: { status: FileUploadStatus }) {
  return (
    <span className={cn("rounded-control px-1.5 py-0.5 text-caption font-medium", TONE[status])}>
      {FILE_LABELS[status]}
    </span>
  );
}
