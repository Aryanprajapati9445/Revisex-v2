import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  AdminOverview,
  Branch,
  BranchWithCounts,
  DeactivationImpact,
  Paginated,
  Program,
  ProgramWithCounts,
  Subject,
  SubjectWithCounts,
} from "@/lib/api-types";
import { DEFAULT_LIMIT, queryKeys, type TaxonomyFilters } from "@/lib/query-keys";

/**
 * `with_counts=true` is what flips these endpoints from the public browse
 * response to the manager one — same paths, extra columns, and the API refuses
 * the flag for anyone who is not an admin.
 */
function adminQuery(filters: TaxonomyFilters) {
  return {
    with_counts: true,
    include_inactive: filters.include_inactive ? true : undefined,
    program_id: filters.program_id,
    branch_id: filters.branch_id,
    semester: filters.semester,
    q: filters.q,
    page: filters.page ?? 1,
    limit: filters.limit ?? DEFAULT_LIMIT,
  };
}

/**
 * keepPreviousData on every list: paging or retyping a filter otherwise drops
 * back to the pending branch and the table flashes empty between keystrokes,
 * which reads as a bug at admin-console list sizes.
 */
export function useAdminPrograms(filters: TaxonomyFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.adminPrograms(filters),
    queryFn: () => api.get<Paginated<ProgramWithCounts>>("/api/programs", adminQuery(filters)),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAdminBranches(filters: TaxonomyFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.adminBranches(filters),
    queryFn: () => api.get<Paginated<BranchWithCounts>>("/api/branches", adminQuery(filters)),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAdminSubjects(filters: TaxonomyFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.adminSubjects(filters),
    queryFn: () => api.get<Paginated<SubjectWithCounts>>("/api/subjects", adminQuery(filters)),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useOverview(enabled = true) {
  return useQuery({
    queryKey: queryKeys.overview,
    queryFn: () => api.get<AdminOverview>("/api/admin/overview"),
    enabled,
  });
}

/**
 * Any taxonomy write can move rows in or out of every other list — deactivating
 * a program hides its branches and subjects too — so one invalidate covers the
 * whole console rather than trying to guess which lists moved. The public
 * browse keys are invalidated alongside it because the same row backs both.
 */
function useTaxonomyInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminTaxonomy });
    void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
    for (const key of ["programs", "branches", "subjects", "program", "branch", "subject"]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}

export interface ProgramInput {
  code: string;
  name: string;
  duration_semesters: number;
}

export function useCreateProgram() {
  const invalidate = useTaxonomyInvalidation();
  return useMutation({
    mutationFn: (input: ProgramInput) => api.post<Program>("/api/programs", input),
    onSuccess: invalidate,
  });
}

export function useUpdateProgram() {
  const invalidate = useTaxonomyInvalidation();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ProgramInput> & { is_active?: boolean } }) =>
      api.patch<Program>(`/api/programs/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeactivateProgram() {
  const invalidate = useTaxonomyInvalidation();
  return useMutation({
    mutationFn: (id: string) => api.delete<DeactivationImpact>(`/api/programs/${id}`),
    onSuccess: invalidate,
  });
}

export interface BranchInput {
  program_id: string;
  code: string;
  name: string;
}

export function useCreateBranch() {
  const invalidate = useTaxonomyInvalidation();
  return useMutation({
    mutationFn: (input: BranchInput) => api.post<Branch>("/api/branches", input),
    onSuccess: invalidate,
  });
}

export function useUpdateBranch() {
  const invalidate = useTaxonomyInvalidation();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { code?: string; name?: string; is_active?: boolean } }) =>
      api.patch<Branch>(`/api/branches/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeactivateBranch() {
  const invalidate = useTaxonomyInvalidation();
  return useMutation({
    mutationFn: (id: string) => api.delete<DeactivationImpact>(`/api/branches/${id}`),
    onSuccess: invalidate,
  });
}

export interface SubjectInput {
  branch_id: string;
  code: string;
  name: string;
  semester: number;
}

export function useCreateSubject() {
  const invalidate = useTaxonomyInvalidation();
  return useMutation({
    mutationFn: (input: SubjectInput) => api.post<Subject>("/api/subjects", input),
    onSuccess: invalidate,
  });
}

export function useUpdateSubject() {
  const invalidate = useTaxonomyInvalidation();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { code?: string; name?: string; semester?: number; is_active?: boolean };
    }) => api.patch<Subject>(`/api/subjects/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeactivateSubject() {
  const invalidate = useTaxonomyInvalidation();
  return useMutation({
    mutationFn: (id: string) => api.delete<DeactivationImpact>(`/api/subjects/${id}`),
    onSuccess: invalidate,
  });
}
