/**
 * What kind of viewer, if any, can show a file inline.
 *
 * Driven by mime_type rather than the filename: the extension is whatever the
 * uploader's machine called it, while mime_type is what was actually sent to
 * storage and what the object is served back as.
 */
export type PreviewKind = "pdf" | "image" | "text" | "none";

const TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/html",
]);

export function previewKindFor(mimeType: string): PreviewKind {
  const type = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("image/")) return "image";
  if (TEXT_TYPES.has(type) || type.startsWith("text/")) return "text";
  return "none";
}

export function canPreview(mimeType: string): boolean {
  return previewKindFor(mimeType) !== "none";
}

/**
 * Human-readable size. Matches the one NoteFileList already used, kept here so
 * the file list and the viewer cannot disagree about how big something is.
 */
export function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
