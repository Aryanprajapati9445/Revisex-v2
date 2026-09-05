import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Branch, Paginated, Program } from "@/lib/api-types";
import { queryKeys } from "@/lib/query-keys";

export interface LandingStats {
  programs: number;
  branches: number;
  subjects: number;
  approvedNotes: number;
}

// programs and notes have a real unscoped total (pagination.total on a
// limit=1 request). branches and subjects are deliberately scoped by the
// backend — GET /api/branches requires program_id and GET /api/subjects
// requires branch_id, by design ("an unscoped list has no product meaning",
// branches.controller.ts) — so their totals are the real sum across every
// active program/branch rather than a single call. All three fan-outs use
// only the taxonomy's own public, unauthenticated list endpoints.
async function fetchLandingStats(): Promise<LandingStats> {
  const [programsPage, notesPage] = await Promise.all([
    api.get<Paginated<Program>>("/api/programs", { limit: 100 }),
    api.get<Paginated<unknown>>("/api/notes", { limit: 1 }),
  ]);

  const branchLists = await Promise.all(
    programsPage.items.map((program) =>
      api.get<Paginated<Branch>>("/api/branches", { program_id: program.id, limit: 100 })
    )
  );

  const allBranches = branchLists.flatMap((page) => page.items);
  const branchesTotal = branchLists.reduce((sum, page) => sum + page.pagination.total, 0);

  const subjectTotals = await Promise.all(
    allBranches.map((branch) =>
      api.get<Paginated<unknown>>("/api/subjects", { branch_id: branch.id, limit: 1 })
    )
  );
  const subjectsTotal = subjectTotals.reduce((sum, page) => sum + page.pagination.total, 0);

  return {
    programs: programsPage.pagination.total,
    branches: branchesTotal,
    subjects: subjectsTotal,
    approvedNotes: notesPage.pagination.total,
  };
}

/** Anonymous-safe aggregate counts for the public landing page. */
export function useLandingStats() {
  return useQuery({
    queryKey: queryKeys.landingStats,
    queryFn: fetchLandingStats,
    staleTime: 5 * 60 * 1000,
  });
}

/** A small, real preview of active programs — informational only, not a browse UI. */
export function useLandingPrograms(limit = 6) {
  return useQuery({
    queryKey: queryKeys.landingPrograms(limit),
    queryFn: () => api.get<Paginated<Program>>("/api/programs", { limit }),
    staleTime: 5 * 60 * 1000,
  });
}
