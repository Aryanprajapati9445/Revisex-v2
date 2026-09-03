import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorState } from "@/components/layout/ErrorState";
import { useAuth } from "@/features/auth/useAuth";
import { NoteTypeFilter } from "@/features/notes/NoteFilters";
import { useSubjects } from "@/features/taxonomy/queries";
import { UploadError, uploadNote, type FileUploadState } from "@/features/notes/upload";
import { ApiError } from "@/lib/api-client";
import type { NoteType } from "@/lib/api-types";
import { PICKER_LIMIT, queryKeys } from "@/lib/query-keys";

// Mirrors the backend's own limits so a doomed upload is refused before a note
// row is created: requestFiles accepts at most 10 files, and completeFile
// requires a positive size_bytes — a 0-byte file would otherwise fail only
// after its S3 PUT had already succeeded.
const MAX_FILES = 10;

function validateFiles(selected: File[]): string | null {
  if (selected.length > MAX_FILES) return `You can attach at most ${MAX_FILES} files.`;
  const empty = selected.find((file) => file.size === 0);
  return empty ? `“${empty.name}” is empty, so it cannot be uploaded.` : null;
}

export function UploadPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [noteType, setNoteType] = useState<NoteType | "">("lecture_notes");
  const [examYear, setExamYear] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [states, setStates] = useState<FileUploadState[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // A student's own branch is the only branch they upload into. Every subject
  // must be offered, not just the first page, so this asks for the picker limit.
  const subjects = useSubjects(user?.branch_id ?? "", undefined, 1, PICKER_LIMIT);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    setStates(files.map(() => "pending"));
    try {
      const note = await uploadNote(
        {
          subject_id: subjectId,
          title,
          description: description.trim() === "" ? null : description,
          note_type: (noteType || "other") as NoteType,
          exam_year: examYear === "" ? null : Number(examYear),
        },
        files,
        (index, state) =>
          setStates((previous) => {
            const next = [...previous];
            next[index] = state;
            return next;
          })
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.notes({}) });
      navigate(`/notes/${note.id}`);
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  const inputClass = "rounded-control bg-surface px-2.5 py-1.5 text-ui outline-none";

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-title font-bold">Upload notes</h1>
        <p className="mt-1 text-lead text-text-muted">
          Your upload is reviewed by an admin before it appears publicly.
        </p>
      </div>

      {error instanceof UploadError ? (
        <div role="alert" className="rounded-card bg-status-rejected-bg px-3 py-2 text-ui text-status-rejected-fg">
          {error.message} Your note was created — you can add its files again from{" "}
          <a className="underline" href={`/notes/${error.noteId}`}>
            the note page
          </a>
          .
        </div>
      ) : error instanceof ApiError ? (
        <ErrorState error={error} />
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-caption text-text-muted">Title</span>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-caption text-text-muted">Description</span>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-caption text-text-muted">Subject</span>
          <select required value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={inputClass}>
            <option value="">Select a subject</option>
            {subjects.data?.items.map((subject) => (
              <option key={subject.id} value={subject.id}>
                Sem {subject.semester} · {subject.code} — {subject.name}
              </option>
            ))}
          </select>
        </label>

        <NoteTypeFilter value={noteType} onChange={setNoteType} />

        {noteType === "pyq" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-caption text-text-muted">Exam year</span>
            <input
              type="number"
              min={1950}
              max={2200}
              value={examYear}
              onChange={(e) => setExamYear(e.target.value)}
              className={inputClass}
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-caption text-text-muted">Files</span>
          <input
            type="file"
            multiple
            onChange={(e) => {
              const selected = Array.from(e.target.files ?? []);
              const problem = validateFiles(selected);
              setFileError(problem);
              setFiles(problem ? [] : selected);
              setStates(problem ? [] : selected.map(() => "pending"));
            }}
            className={inputClass}
          />
          {fileError && (
            <span role="alert" className="text-caption text-status-rejected-fg">
              {fileError}
            </span>
          )}
        </label>

        {files.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {files.map((file, index) => (
              <li key={file.name} className="flex items-center justify-between rounded-card bg-surface px-3 py-2 text-ui">
                <span className="truncate">{file.name}</span>
                <span className="text-caption text-text-tertiary">{states[index] ?? "pending"}</span>
              </li>
            ))}
          </ul>
        )}

        <button
          type="submit"
          disabled={pending || subjectId === "" || fileError !== null}
          className="rounded-full bg-accent px-4 py-2 text-ui font-medium text-white transition-colors duration-150 disabled:opacity-60"
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
      </form>
    </div>
  );
}
