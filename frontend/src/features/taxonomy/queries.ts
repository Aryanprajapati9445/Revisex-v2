import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Branch, Paginated, Program, Subject } from "@/lib/api-types";
import { DEFAULT_LIMIT, queryKeys } from "@/lib/query-keys";

export function usePrograms(page = 1, limit = DEFAULT_LIMIT) {
  return useQuery({
    queryKey: queryKeys.programs(page, limit),
    queryFn: () => api.get<Paginated<Program>>("/api/programs", { page, limit }),
  });
}

export function useProgram(id: string) {
  return useQuery({
    queryKey: queryKeys.program(id),
    queryFn: () => api.get<Program>(`/api/programs/${id}`),
    enabled: id !== "",
  });
}

export function useBranch(id: string) {
  return useQuery({
    queryKey: queryKeys.branch(id),
    queryFn: () => api.get<Branch>(`/api/branches/${id}`),
    enabled: id !== "",
  });
}

export function useSubject(id: string) {
  return useQuery({
    queryKey: queryKeys.subject(id),
    queryFn: () => api.get<Subject>(`/api/subjects/${id}`),
    enabled: id !== "",
  });
}

export function useBranches(programId: string, page = 1, limit = DEFAULT_LIMIT) {
  return useQuery({
    queryKey: queryKeys.branches(programId, page, limit),
    queryFn: () => api.get<Paginated<Branch>>("/api/branches", { program_id: programId, page, limit }),
    enabled: programId !== "",
  });
}

export function useSubjects(branchId: string, semester?: number, page = 1, limit = DEFAULT_LIMIT) {
  return useQuery({
    queryKey: queryKeys.subjects(branchId, semester, page, limit),
    queryFn: () =>
      api.get<Paginated<Subject>>("/api/subjects", { branch_id: branchId, semester, page, limit }),
    enabled: branchId !== "",
  });
}
