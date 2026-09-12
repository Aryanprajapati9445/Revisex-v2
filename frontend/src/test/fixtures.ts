import type { NoteCard } from "@/lib/api-types";

/**
 * A note in the shape the API actually returns.
 *
 * Every listing and the detail endpoint return the enriched card — taxonomy,
 * stats, tags, and the viewer's own bookmark and rating. Test files used to
 * each hand-roll a bare note, which meant a component reading a new field
 * crashed only in tests, on data no endpoint produces. One builder here keeps
 * fixtures honest to the contract.
 */
export function makeNoteCard(overrides: Partial<NoteCard> = {}): NoteCard {
  return {
    id: "n1",
    subject_id: "s1",
    uploader_id: "u1",
    title: "Unit 1 Notes",
    description: "Covers the basics",
    note_type: "lecture_notes",
    exam_year: null,
    status: "approved",
    reviewed_by: null,
    reviewed_at: "2026-01-02T00:00:00.000Z",
    rejection_reason: null,
    download_count: 3,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",

    subject_name: "Database Systems",
    subject_code: "KCS-501",
    semester: 5,
    branch_id: "b1",
    branch_name: "Computer Science",
    program_id: "p1",
    program_name: "B.Tech",

    rating_avg: 0,
    rating_count: 0,
    bookmark_count: 0,
    comment_count: 0,

    viewer_bookmarked: false,
    viewer_rating: null,

    uploader_name: "Aarav Sharma",
    tags: [],

    ...overrides,
  };
}
