import { ApiError, api, putToPresignedUrl } from "@/lib/api-client";
import type { Note, NoteFile, NoteType } from "@/lib/api-types";

export interface CreateNoteInput {
  subject_id: string;
  title: string;
  description: string | null;
  note_type: NoteType;
  exam_year: number | null;
}

export type FileUploadState = "pending" | "uploading" | "completing" | "done" | "failed";

export type UploadProgress = (index: number, state: FileUploadState) => void;

interface PresignedFile {
  file: NoteFile;
  putUrl: string;
}

/**
 * Carries the created note's id so a caller can offer "retry the files"
 * instead of stranding a real note with pending file rows.
 */
export class UploadError extends Error {
  // Declared explicitly rather than as constructor parameter properties, which
  // the scaffold's erasableSyntaxOnly setting rejects (TS1294).
  readonly noteId: string;
  override readonly cause?: unknown;

  constructor(message: string, noteId: string, cause?: unknown) {
    super(message);
    this.name = "UploadError";
    this.noteId = noteId;
    this.cause = cause;
  }
}

/**
 * Four steps, in order:
 *   1. create the note (status pending)
 *   2. ask for presigned PUT URLs
 *   3. PUT each file straight to S3 (no auth header — see putToPresignedUrl)
 *   4. tell the API each upload finished
 */
export async function uploadNote(
  input: CreateNoteInput,
  files: File[],
  onProgress?: UploadProgress
): Promise<Note> {
  const note = await api.post<Note>("/api/notes", input);

  if (files.length === 0) return note;

  let presigned: PresignedFile[];
  try {
    presigned = await api.post<PresignedFile[]>(`/api/notes/${note.id}/files`, {
      files: files.map((file) => ({
        original_filename: file.name,
        mime_type: file.type || "application/octet-stream",
      })),
    });
  } catch (error) {
    throw new UploadError("Could not prepare the upload.", note.id, error);
  }

  for (const [index, entry] of presigned.entries()) {
    const file = files[index]!;
    try {
      onProgress?.(index, "uploading");
      await putToPresignedUrl(entry.putUrl, file);

      onProgress?.(index, "completing");
      await api.post(`/api/notes/${note.id}/files/${entry.file.id}/complete`, { size_bytes: file.size });

      onProgress?.(index, "done");
    } catch (error) {
      // The backend's complete is single-shot, so a retry of an already
      // completed file answers 409 CONFLICT. That means the work is done.
      if (error instanceof ApiError && error.status === 409) {
        onProgress?.(index, "done");
        continue;
      }
      onProgress?.(index, "failed");
      throw new UploadError(`Could not upload ${file.name}.`, note.id, error);
    }
  }

  return note;
}
