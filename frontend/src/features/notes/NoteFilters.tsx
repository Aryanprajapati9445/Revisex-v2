import type { NoteType } from "@/lib/api-types";

const TYPES: { value: NoteType | ""; label: string }[] = [
  { value: "", label: "All types" },
  { value: "lecture_notes", label: "Lecture notes" },
  { value: "pyq", label: "Past papers" },
  { value: "lab_manual", label: "Lab manuals" },
  { value: "assignment", label: "Assignments" },
  { value: "book", label: "Books" },
  { value: "other", label: "Other" },
];

export function NoteTypeFilter({
  value,
  onChange,
}: {
  value: NoteType | "";
  onChange: (value: NoteType | "") => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-caption text-text-muted">Type</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as NoteType | "")}
        className="rounded-control bg-surface px-2.5 py-1.5 text-ui outline-none"
      >
        {TYPES.map((type) => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </select>
    </label>
  );
}
