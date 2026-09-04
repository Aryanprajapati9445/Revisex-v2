/**
 * What kind of viewer, if any, can show a file inline.
 *
 * Driven by mime_type rather than the filename: the extension is whatever the
 * uploader's machine called it, while mime_type is what the object is actually
 * served back as, and therefore what the browser will act on.
 */
export type PreviewKind = "pdf" | "image" | "text" | "none";

/**
 * Inert text types only.
 *
 * text/html is deliberately absent and must stay absent. Everything here gets
 * framed, and a framed HTML document is a script execution context; the others
 * render as literal text no matter what they contain. The backend also refuses
 * to store an upload declared as active content, so this is the second of two
 * gates rather than the only one.
 */
const TEXT_TYPES = new Set(["text/plain", "text/markdown", "text/csv", "application/json"]);

export function previewKindFor(mimeType: string): PreviewKind {
  const type = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("image/")) return "image";
  if (TEXT_TYPES.has(type)) return "text";
  return "none";
}

export function canPreview(mimeType: string): boolean {
  return previewKindFor(mimeType) !== "none";
}

/**
 * Whether the embedding frame can carry a sandbox attribute.
 *
 * Chrome refuses to run its built-in PDF viewer inside a sandboxed iframe — any
 * sandbox value, including one that allows scripts and same-origin, leaves a
 * broken-document icon rather than the document. Verified in a browser against
 * all five variants; only the unsandboxed frame renders.
 *
 * Dropping the sandbox for PDFs specifically is acceptable because the file is
 * served from the storage origin, never the app's: whatever it does, it cannot
 * reach this origin's cookies or localStorage. The reason to keep the sandbox
 * everywhere else is that those types are cheap to isolate, so there is no
 * reason not to.
 */
export function sandboxFor(kind: PreviewKind): string | undefined {
  return kind === "pdf" ? undefined : "";
}

/**
 * Human-readable size. Shared with the file list so the two cannot disagree
 * about how big something is.
 */
export function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
