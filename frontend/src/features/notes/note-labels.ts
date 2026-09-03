import type { Note } from "@/lib/api-types";

export const TYPE_LABELS: Record<Note["note_type"], string> = {
  lecture_notes: "Lecture notes",
  pyq: "Past paper",
  lab_manual: "Lab manual",
  assignment: "Assignment",
  book: "Book",
  other: "Other",
};
