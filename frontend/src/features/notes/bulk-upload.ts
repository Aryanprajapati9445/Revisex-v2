import { uploadNote, type CreateNoteInput, type FileUploadState } from "./upload";
import type { Note, NoteType } from "@/lib/api-types";

/**
 * Two shapes of bulk upload, because both are real:
 *
 *  - "single": one note carrying every file (a subject's lab manual, scanned as
 *    twelve pages).
 *  - "per-file": one note per file (a folder of past papers, each its own
 *    document with its own title).
 *
 * Anything else — twelve notes of twelve files each — is twelve trips through
 * the form, and pretending otherwise would need a grouping UI nobody asked for.
 */
export type BatchMode = "single" | "per-file";

export interface BatchItem {
  /** Index into the caller's file list, so progress maps back to a row. */
  index: number;
  file: File;
  title: string;
  state: FileUploadState;
  noteId?: string;
  error?: string;
}

export interface BatchInput {
  subject_id: string;
  note_type: NoteType;
  exam_year: number | null;
  description: string | null;
  /** Used verbatim in "single" mode; the per-file titles win in "per-file". */
  title: string;
}

/** "CS201 Unit 3 notes.pdf" -> "CS201 Unit 3 notes" */
export function titleFromFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.[^./\\]+$/, "");
  return withoutExtension.replace(/[_-]+/g, " ").trim() || filename;
}

export interface BatchResult {
  notes: Note[];
  failures: { index: number; message: string }[];
}

/**
 * Uploads a batch, reporting per-item progress as it goes.
 *
 * Sequential on purpose: each note is a create + a presign + one PUT per file +
 * a complete, so a parallel batch of thirty files opens well over a hundred
 * requests at once and the S3 PUTs starve each other. It also means a failure
 * halfway leaves a knowable set of finished notes rather than a scatter.
 *
 * A failed item does not abort the batch — the rest still upload, and the
 * caller gets the failures back to show against their rows.
 */
export async function uploadBatch(
  input: BatchInput,
  files: File[],
  mode: BatchMode,
  onItemState: (index: number, state: FileUploadState, detail?: { noteId?: string; error?: string }) => void
): Promise<BatchResult> {
  const notes: Note[] = [];
  const failures: { index: number; message: string }[] = [];

  const base: Omit<CreateNoteInput, "title"> = {
    subject_id: input.subject_id,
    description: input.description,
    note_type: input.note_type,
    exam_year: input.exam_year,
  };

  if (mode === "single") {
    files.forEach((_, index) => onItemState(index, "uploading"));
    try {
      const note = await uploadNote({ ...base, title: input.title }, files, (index, state) =>
        onItemState(index, state, { noteId: undefined })
      );
      notes.push(note);
      files.forEach((_, index) => onItemState(index, "done", { noteId: note.id }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      files.forEach((_, index) => onItemState(index, "failed", { error: message }));
      failures.push({ index: 0, message });
    }
    return { notes, failures };
  }

  for (const [index, file] of files.entries()) {
    try {
      onItemState(index, "uploading");
      const note = await uploadNote({ ...base, title: titleFromFilename(file.name) }, [file], (_, state) =>
        onItemState(index, state)
      );
      notes.push(note);
      onItemState(index, "done", { noteId: note.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      onItemState(index, "failed", { error: message });
      failures.push({ index, message });
    }
  }

  return { notes, failures };
}
