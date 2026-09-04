import { pool } from "../../config/db.js";
import type { ActorScope } from "../../lib/taxonomyAccess.js";

export interface OverviewTotals {
  programs: number;
  branches: number;
  subjects: number;
  users: number;
  notes: number;
  pending_notes: number;
  approved_notes: number;
  rejected_notes: number;
  files: number;
  downloads: number;
  storage_bytes: number;
  uploads_last_7_days: number;
}

export interface OverviewProgramRow {
  id: string;
  code: string;
  name: string;
  duration_semesters: number;
  is_active: boolean;
  branch_count: number;
  subject_count: number;
  note_count: number;
  pending_note_count: number;
  user_count: number;
  /** Every branch under this program, so the dashboard can show the tree without an N+1. */
  branches: OverviewBranchRow[];
}

export interface OverviewBranchRow {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  subject_count: number;
  note_count: number;
  pending_note_count: number;
  student_count: number;
}

export interface Overview {
  scope: { program_id: string | null; branch_id: string | null };
  totals: OverviewTotals;
  programs: OverviewProgramRow[];
  notes_by_type: { note_type: string; count: number }[];
  recent_activity: {
    id: string;
    title: string;
    status: string;
    created_at: string;
    subject_code: string;
    branch_code: string;
    program_code: string;
    uploader_name: string | null;
  }[];
}

/**
 * Everything the admin home screen shows, in four queries rather than the
 * request-per-program storm a client-side assembly would produce.
 *
 * `scope` narrows every figure to what the actor may see: a superuser gets the
 * platform, a program_admin their program, a branch_admin their branch. The
 * filters are built once here and pasted into each query so a figure can never
 * disagree with the row list beneath it.
 */
export async function getOverview(scope: ActorScope): Promise<Overview> {
  const params: unknown[] = [];
  // Each filter is written against a `branches b` alias the caller must have in
  // scope; program-level queries use the program filter instead.
  let branchFilter = "TRUE";
  let programFilter = "TRUE";

  if (scope.branchId) {
    params.push(scope.branchId);
    branchFilter = `b.id = $${params.length}`;
    programFilter = `p.id = (SELECT program_id FROM branches WHERE id = $${params.length})`;
  } else if (scope.programId) {
    params.push(scope.programId);
    branchFilter = `b.program_id = $${params.length}`;
    programFilter = `p.id = $${params.length}`;
  }

  const totalsQuery = pool.query<OverviewTotals>(
    `SELECT
       (SELECT COUNT(*)::int FROM programs p WHERE ${programFilter}) AS programs,
       (SELECT COUNT(*)::int FROM branches b WHERE ${branchFilter}) AS branches,
       (SELECT COUNT(*)::int FROM subjects s JOIN branches b ON b.id = s.branch_id WHERE ${branchFilter}) AS subjects,
       (SELECT COUNT(*)::int FROM users u
          LEFT JOIN branches b ON b.id = u.branch_id
         WHERE b.id IS NOT NULL AND ${branchFilter}) AS users,
       (SELECT COUNT(*)::int FROM notes n
          JOIN subjects s ON s.id = n.subject_id
          JOIN branches b ON b.id = s.branch_id WHERE ${branchFilter}) AS notes,
       (SELECT COUNT(*)::int FROM notes n
          JOIN subjects s ON s.id = n.subject_id
          JOIN branches b ON b.id = s.branch_id WHERE ${branchFilter} AND n.status = 'pending') AS pending_notes,
       (SELECT COUNT(*)::int FROM notes n
          JOIN subjects s ON s.id = n.subject_id
          JOIN branches b ON b.id = s.branch_id WHERE ${branchFilter} AND n.status = 'approved') AS approved_notes,
       (SELECT COUNT(*)::int FROM notes n
          JOIN subjects s ON s.id = n.subject_id
          JOIN branches b ON b.id = s.branch_id WHERE ${branchFilter} AND n.status = 'rejected') AS rejected_notes,
       (SELECT COUNT(*)::int FROM files f
          JOIN notes n ON n.id = f.note_id
          JOIN subjects s ON s.id = n.subject_id
          JOIN branches b ON b.id = s.branch_id WHERE ${branchFilter}) AS files,
       (SELECT COALESCE(SUM(n.download_count), 0)::int FROM notes n
          JOIN subjects s ON s.id = n.subject_id
          JOIN branches b ON b.id = s.branch_id WHERE ${branchFilter}) AS downloads,
       (SELECT COALESCE(SUM(f.size_bytes), 0)::bigint FROM files f
          JOIN notes n ON n.id = f.note_id
          JOIN subjects s ON s.id = n.subject_id
          JOIN branches b ON b.id = s.branch_id WHERE ${branchFilter}) AS storage_bytes,
       (SELECT COUNT(*)::int FROM notes n
          JOIN subjects s ON s.id = n.subject_id
          JOIN branches b ON b.id = s.branch_id
         WHERE ${branchFilter} AND n.created_at >= now() - interval '7 days') AS uploads_last_7_days`,
    params
  );

  const programsQuery = pool.query<Omit<OverviewProgramRow, "branches">>(
    `SELECT p.id, p.code, p.name, p.duration_semesters, p.is_active,
            (SELECT COUNT(*)::int FROM branches b WHERE b.program_id = p.id AND ${branchFilter}) AS branch_count,
            (SELECT COUNT(*)::int FROM subjects s JOIN branches b ON b.id = s.branch_id
              WHERE b.program_id = p.id AND ${branchFilter}) AS subject_count,
            (SELECT COUNT(*)::int FROM notes n
               JOIN subjects s ON s.id = n.subject_id
               JOIN branches b ON b.id = s.branch_id
              WHERE b.program_id = p.id AND ${branchFilter}) AS note_count,
            (SELECT COUNT(*)::int FROM notes n
               JOIN subjects s ON s.id = n.subject_id
               JOIN branches b ON b.id = s.branch_id
              WHERE b.program_id = p.id AND ${branchFilter} AND n.status = 'pending') AS pending_note_count,
            (SELECT COUNT(*)::int FROM users u JOIN branches b ON b.id = u.branch_id
              WHERE b.program_id = p.id AND ${branchFilter}) AS user_count
       FROM programs p
      WHERE ${programFilter}
      ORDER BY p.is_active DESC, p.code ASC`,
    params
  );

  const branchesQuery = pool.query<OverviewBranchRow & { program_id: string }>(
    `SELECT b.id, b.program_id, b.code, b.name, b.is_active,
            (SELECT COUNT(*)::int FROM subjects s WHERE s.branch_id = b.id) AS subject_count,
            (SELECT COUNT(*)::int FROM notes n JOIN subjects s ON s.id = n.subject_id
              WHERE s.branch_id = b.id) AS note_count,
            (SELECT COUNT(*)::int FROM notes n JOIN subjects s ON s.id = n.subject_id
              WHERE s.branch_id = b.id AND n.status = 'pending') AS pending_note_count,
            (SELECT COUNT(*)::int FROM users u WHERE u.branch_id = b.id) AS student_count
       FROM branches b
      WHERE ${branchFilter}
      ORDER BY b.is_active DESC, b.code ASC`,
    params
  );

  const byTypeQuery = pool.query<{ note_type: string; count: number }>(
    `SELECT n.note_type, COUNT(*)::int AS count
       FROM notes n
       JOIN subjects s ON s.id = n.subject_id
       JOIN branches b ON b.id = s.branch_id
      WHERE ${branchFilter}
      GROUP BY n.note_type
      ORDER BY count DESC`,
    params
  );

  const recentQuery = pool.query<Overview["recent_activity"][number]>(
    `SELECT n.id, n.title, n.status, n.created_at,
            s.code AS subject_code, b.code AS branch_code, p.code AS program_code,
            u.full_name AS uploader_name
       FROM notes n
       JOIN subjects s ON s.id = n.subject_id
       JOIN branches b ON b.id = s.branch_id
       JOIN programs p ON p.id = b.program_id
       LEFT JOIN users u ON u.id = n.uploader_id
      WHERE ${branchFilter}
      ORDER BY n.created_at DESC
      LIMIT 8`,
    params
  );

  const [totals, programs, branches, byType, recent] = await Promise.all([
    totalsQuery,
    programsQuery,
    branchesQuery,
    byTypeQuery,
    recentQuery,
  ]);

  const branchesByProgram = new Map<string, OverviewBranchRow[]>();
  for (const { program_id, ...branch } of branches.rows) {
    const list = branchesByProgram.get(program_id);
    if (list) list.push(branch);
    else branchesByProgram.set(program_id, [branch]);
  }

  return {
    scope: { program_id: scope.programId, branch_id: scope.branchId },
    // The totals query always returns exactly one row.
    totals: {
      ...totals.rows[0]!,
      // SUM(bigint) comes back as a string from node-postgres, which would
      // reach the UI as "0" and format as NaN when divided.
      storage_bytes: Number(totals.rows[0]!.storage_bytes ?? 0),
    },
    programs: programs.rows.map((program) => ({
      ...program,
      branches: branchesByProgram.get(program.id) ?? [],
    })),
    notes_by_type: byType.rows,
    recent_activity: recent.rows,
  };
}
