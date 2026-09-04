import { AlertCircle, CheckCircle2, FileUp, Trash2, UploadCloud, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NoteTypeFilter } from "@/features/notes/NoteFilters";
import { titleFromFilename, uploadBatch, type BatchMode } from "@/features/notes/bulk-upload";
import type { FileUploadState } from "@/features/notes/upload";
import { EMPTY_SELECTION, ScopedSubjectPicker, type SubjectSelection } from "@/features/taxonomy/ScopedSubjectPicker";
import type { NoteType } from "@/lib/api-types";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

// Mirrors the backend's own limit: POST /api/notes/:id/files accepts at most
// ten per note, so a "single note" batch is refused before a note row exists.
const MAX_FILES_PER_NOTE = 10;
// Not a server limit — a guard against dropping an entire Downloads folder,
// since per-file mode issues four requests per file.
const MAX_FILES_PER_BATCH = 50;

interface Row {
  file: File;
  state: FileUploadState;
  noteId?: string;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

const STATE_LABEL: Record<FileUploadState, string> = {
  pending: "Queued",
  uploading: "Uploading",
  completing: "Finishing",
  done: "Done",
  failed: "Failed",
};

const STATE_TONE: Record<FileUploadState, string> = {
  pending: "text-text-tertiary",
  uploading: "text-status-pending-fg",
  completing: "text-status-pending-fg",
  done: "text-status-approved-fg",
  failed: "text-status-rejected-fg",
};

export function BulkUploadPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [selection, setSelection] = useState<SubjectSelection>(EMPTY_SELECTION);
  const [mode, setMode] = useState<BatchMode>("per-file");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [noteType, setNoteType] = useState<NoteType | "">("lecture_notes");
  const [examYear, setExamYear] = useState("");

  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState<{ created: number; failed: number } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const addFiles = useCallback(
    (incoming: File[]) => {
      setFinished(null);
      setRows((current) => {
        // De-duplicated on name+size: dropping the same folder twice is the
        // easiest mistake to make here and the costliest to undo.
        const seen = new Set(current.map((row) => `${row.file.name}:${row.file.size}`));
        const added = incoming.filter((file) => !seen.has(`${file.name}:${file.size}`));
        const next = [...current, ...added.map((file) => ({ file, state: "pending" as FileUploadState }))];

        if (next.length > MAX_FILES_PER_BATCH) {
          setFileError(`A batch is capped at ${MAX_FILES_PER_BATCH} files. The extras were not added.`);
          return next.slice(0, MAX_FILES_PER_BATCH);
        }
        const empty = added.find((file) => file.size === 0);
        setFileError(empty ? `“${empty.name}” is empty, so it cannot be uploaded.` : null);
        return next;
      });
    },
    []
  );

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles([...event.dataTransfer.files]);
  }

  function handlePick(event: ChangeEvent<HTMLInputElement>) {
    addFiles([...(event.target.files ?? [])]);
    // Reset so re-picking the same file fires change again.
    event.target.value = "";
  }

  const emptyFile = useMemo(() => rows.find((row) => row.file.size === 0), [rows]);
  const tooManyForOneNote = mode === "single" && rows.length > MAX_FILES_PER_NOTE;

  const blockingError = tooManyForOneNote
    ? `One note holds at most ${MAX_FILES_PER_NOTE} files. Switch to “a note per file”, or remove some.`
    : emptyFile
      ? `“${emptyFile.file.name}” is empty, so it cannot be uploaded.`
      : null;

  const canSubmit =
    !running &&
    rows.length > 0 &&
    selection.subjectId !== "" &&
    blockingError === null &&
    (mode === "per-file" || title.trim() !== "");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setRunning(true);
    setFinished(null);
    setRows((current) => current.map((row) => ({ ...row, state: "pending", error: undefined })));

    const result = await uploadBatch(
      {
        subject_id: selection.subjectId,
        note_type: (noteType || "other") as NoteType,
        exam_year: examYear === "" ? null : Number(examYear),
        description: description.trim() === "" ? null : description.trim(),
        title: title.trim(),
      },
      rows.map((row) => row.file),
      mode,
      (index, state, detail) =>
        setRows((current) => {
          const next = [...current];
          const row = next[index];
          if (row) next[index] = { ...row, state, noteId: detail?.noteId ?? row.noteId, error: detail?.error };
          return next;
        })
    );

    await queryClient.invalidateQueries({ queryKey: queryKeys.notes({}) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.overview });
    setFinished({ created: result.notes.length, failed: result.failures.length });
    setRunning(false);
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Bulk upload"
        description="Add many files in one pass. Where they can go is bounded by what you administer."
      />

      <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
        <section className="flex flex-col gap-4 rounded-panel bg-surface p-4">
          <h2 className="text-ui font-medium text-text-primary">Where these go</h2>
          <ScopedSubjectPicker value={selection} onChange={setSelection} idPrefix="bulk" />
        </section>

        <section className="flex flex-col gap-4 rounded-panel bg-surface p-4">
          <h2 className="text-ui font-medium text-text-primary">How to file them</h2>

          <div className="flex flex-col gap-2">
            <span className="text-caption text-text-muted">Each file becomes…</span>
            <div className="flex flex-wrap gap-2">
              <ModeOption
                active={mode === "per-file"}
                onClick={() => setMode("per-file")}
                title="Its own note"
                hint="Titles come from the filenames. Best for a folder of past papers."
              />
              <ModeOption
                active={mode === "single"}
                onClick={() => setMode("single")}
                title="One note together"
                hint={`Up to ${MAX_FILES_PER_NOTE} files under a single title. Best for a scanned document.`}
              />
            </div>
          </div>

          {mode === "single" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-title">Note title</Label>
              <Input
                id="bulk-title"
                required
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Unit 3 — lecture notes"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* NoteTypeFilter renders its own "Type" label, so this column
                supplies only the layout. */}
            <div className="flex flex-col justify-end gap-1.5">
              <NoteTypeFilter value={noteType} onChange={setNoteType} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-exam-year">Exam year (optional)</Label>
              <Input
                id="bulk-exam-year"
                type="number"
                min={1950}
                max={2200}
                value={examYear}
                onChange={(event) => setExamYear(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-description">Description (optional)</Label>
            <Textarea
              id="bulk-description"
              rows={2}
              maxLength={5000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Applied to every note in this batch."
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={cn(
              "flex flex-col items-center gap-2 rounded-panel border border-dashed px-6 py-10 text-center transition-colors duration-150",
              dragging ? "border-primary bg-accent/40" : "border-border bg-surface"
            )}
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-background text-text-tertiary">
              <UploadCloud className="size-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <p className="text-base font-medium text-text-primary">Drop files here</p>
            <p className="text-ui text-text-muted">
              or pick them yourself — up to {MAX_FILES_PER_BATCH} at a time.
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={handlePick}
              aria-label="Choose files to upload"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <FileUp className="size-3.5" strokeWidth={2} aria-hidden="true" />
              Choose files
            </Button>
          </div>

          {fileError && (
            <Alert variant="destructive" role="alert">
              <AlertCircle />
              <AlertDescription>{fileError}</AlertDescription>
            </Alert>
          )}

          {rows.length > 0 && (
            <ul className="flex flex-col divide-y divide-border rounded-card bg-surface">
              {rows.map((row, index) => (
                <li key={`${row.file.name}:${row.file.size}`} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-ui text-text-primary">
                      {mode === "per-file" ? titleFromFilename(row.file.name) : row.file.name}
                    </span>
                    <span className="truncate font-mono text-caption text-text-tertiary">
                      {row.file.name} · {formatBytes(row.file.size)}
                      {row.error ? ` · ${row.error}` : ""}
                    </span>
                  </span>

                  <span className={cn("ml-auto shrink-0 text-caption font-medium", STATE_TONE[row.state])}>
                    {STATE_LABEL[row.state]}
                  </span>

                  {row.noteId ? (
                    <Button asChild variant="ghost" size="icon-sm" aria-label="Open the created note">
                      <Link to={`/notes/${row.noteId}`}>
                        <CheckCircle2 className="size-4 text-status-approved-fg" strokeWidth={2} aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={running}
                      onClick={() => removeRow(index)}
                      aria-label={`Remove ${row.file.name}`}
                    >
                      <X className="size-4" strokeWidth={2} aria-hidden="true" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {blockingError && (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertDescription>{blockingError}</AlertDescription>
          </Alert>
        )}

        {finished && (
          <Alert role="status">
            <CheckCircle2 />
            <AlertDescription>
              {finished.created} note{finished.created === 1 ? "" : "s"} created
              {finished.failed > 0 ? `, ${finished.failed} failed — the rows above say which.` : "."} Each one is
              pending review until it is approved.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!canSubmit}>
            <UploadCloud className="size-4" strokeWidth={2} aria-hidden="true" />
            {running
              ? "Uploading…"
              : `Upload ${rows.length || ""} file${rows.length === 1 ? "" : "s"}`.trim()}
          </Button>
          {rows.length > 0 && !running && (
            <Button type="button" variant="ghost" onClick={() => setRows([])}>
              <Trash2 className="size-4" strokeWidth={2} aria-hidden="true" />
              Clear the list
            </Button>
          )}
          {selection.subjectId === "" && rows.length > 0 && (
            <span className="text-caption text-text-tertiary">Pick a subject before uploading.</span>
          )}
        </div>
      </form>
    </div>
  );
}

function ModeOption({
  active,
  onClick,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex max-w-xs flex-col gap-0.5 rounded-card px-3 py-2 text-left transition-colors duration-150",
        active ? "bg-accent text-accent-foreground" : "bg-background text-text-muted hover:bg-surface-elevated"
      )}
    >
      <span className="text-ui font-medium">{title}</span>
      <span className="text-caption opacity-80">{hint}</span>
    </button>
  );
}
