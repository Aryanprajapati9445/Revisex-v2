import type { Note, NoteType, NoteStatus } from "../types/index.js";

/**
 * A note as every student-facing surface wants it: the note itself, where it
 * sits in the tree, and how the community has responded to it.
 *
 * Browse, search, the subject listing, saved notes and the home page all render
 * the same card, and each one previously would have had to fetch the subject,
 * branch and program separately to label it. One projection, one set of joins.
 */
export interface NoteCard extends Note {
  subject_name: string;
  subject_code: string;
  semester: number;
  branch_id: string;
  branch_name: string;
  program_id: string;
  program_name: string;

  rating_avg: number;
  rating_count: number;
  bookmark_count: number;
  comment_count: number;

  /** Null for a signed-out viewer; otherwise whether this viewer saved or rated it. */
  viewer_bookmarked: boolean | null;
  viewer_rating: number | null;

  uploader_name: string | null;
  tags: string[];
}

/**
 * Selected columns for a NoteCard. `n` is the notes table.
 *
 * The viewer's own bookmark and rating come back in the same pass rather than
 * as an N+1 per card; pass null for a signed-out viewer and both are null.
 */
export const NOTE_CARD_COLUMNS = `
  n.id, n.subject_id, n.uploader_id, n.title, n.description, n.note_type, n.exam_year,
  n.status, n.reviewed_by, n.reviewed_at, n.rejection_reason,
  n.download_count, n.created_at, n.updated_at,
  s.name AS subject_name, s.code AS subject_code, s.semester,
  b.id AS branch_id, b.name AS branch_name,
  p.id AS program_id, p.name AS program_name,
  st.rating_avg, st.rating_count, st.bookmark_count, st.comment_count,
  u.full_name AS uploader_name,
  (vb.note_id IS NOT NULL) AS viewer_bookmarked,
  vr.rating AS viewer_rating,
  COALESCE(tg.tags, ARRAY[]::text[]) AS tags
`;

/**
 * Joins backing NOTE_CARD_COLUMNS. Taxonomy joins are inner — every note has a
 * subject, branch and program by foreign key — while the viewer-specific and
 * tag joins are left, because most notes have neither.
 *
 * v_note_stats is the schema's own definition of "how a note is scored"; going
 * through it keeps the aggregate out of the application, which is what the view
 * was written for.
 */
export function noteCardJoins(viewerParam: number): string {
  return `
  JOIN subjects s      ON s.id = n.subject_id
  JOIN branches b      ON b.id = s.branch_id
  JOIN programs p      ON p.id = b.program_id
  JOIN v_note_stats st ON st.note_id = n.id
  LEFT JOIN users u    ON u.id = n.uploader_id
  LEFT JOIN bookmarks vb ON vb.note_id = n.id AND vb.user_id = $${viewerParam}::uuid
  LEFT JOIN ratings   vr ON vr.note_id = n.id AND vr.user_id = $${viewerParam}::uuid
  LEFT JOIN LATERAL (
    SELECT array_agg(t.name ORDER BY t.name) AS tags
      FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
     WHERE nt.note_id = n.id
  ) tg ON true
`;
}

/**
 * The taxonomy joins alone, for the COUNT that pairs with a NoteCard listing.
 *
 * A count must not carry the viewer parameter: it never references it, and
 * Postgres rejects a bind parameter whose type it cannot infer from the query
 * text ("could not determine data type of parameter"). Keeping the two
 * fragments separate is also why the count does not pay for the stats, tag and
 * viewer lookups it would throw away.
 */
export const NOTE_COUNT_JOINS = `
  JOIN subjects s ON s.id = n.subject_id
  JOIN branches b ON b.id = s.branch_id
`;

/**
 * Postgres returns NUMERIC and COUNT(*) as strings to avoid precision loss in
 * JS numbers, so an uncoerced rating_avg would reach the client as "4.50" and
 * a rating_count as "12". Coercing here keeps every caller from re-discovering
 * that.
 */
export function toNoteCard(row: Record<string, unknown>): NoteCard {
  return {
    ...(row as unknown as Note),
    note_type: row.note_type as NoteType,
    status: row.status as NoteStatus,
    subject_name: row.subject_name as string,
    subject_code: row.subject_code as string,
    semester: Number(row.semester),
    branch_id: row.branch_id as string,
    branch_name: row.branch_name as string,
    program_id: row.program_id as string,
    program_name: row.program_name as string,
    rating_avg: Number(row.rating_avg ?? 0),
    rating_count: Number(row.rating_count ?? 0),
    bookmark_count: Number(row.bookmark_count ?? 0),
    comment_count: Number(row.comment_count ?? 0),
    download_count: Number(row.download_count ?? 0),
    viewer_bookmarked: row.viewer_bookmarked === null ? null : Boolean(row.viewer_bookmarked),
    viewer_rating: row.viewer_rating === null || row.viewer_rating === undefined ? null : Number(row.viewer_rating),
    uploader_name: (row.uploader_name as string | null) ?? null,
    tags: (row.tags as string[] | null) ?? [],
  };
}

/**
 * How a list of notes is ordered. "recent" stays the default everywhere so an
 * unsorted listing keeps the behaviour it has today.
 *
 * `top_rated` sorts by rating_count as the tiebreaker rather than by average
 * alone: without it a single 5-star rating outranks fifty averaging 4.8.
 */
export const NOTE_SORTS = {
  recent: "n.created_at DESC",
  top_rated: "st.rating_avg DESC, st.rating_count DESC, n.created_at DESC",
  most_downloaded: "n.download_count DESC, n.created_at DESC",
  most_saved: "st.bookmark_count DESC, n.created_at DESC",
} as const;

export type NoteSort = keyof typeof NOTE_SORTS;
