import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Branch, Paginated, Program, Subject } from "@/lib/api-types";
import { queryKeys } from "@/lib/query-keys";

export function usePrograms(page = 1) {
  return useQuery({
    queryKey: queryKeys.programs(page),
    queryFn: () => api.get<Paginated<Program>>("/api/programs", { page }),
  });
}

export function useProgram(id: string) {
  return useQuery({
    queryKey: queryKeys.program(id),
    queryFn: () => api.get<Program>(`/api/programs/${id}`),
    enabled: id !== "",
  });
}

export function useBranches(programId: string, page = 1) {
  return useQuery({
    queryKey: queryKeys.branches(programId, page),
    queryFn: () => api.get<Paginated<Branch>>("/api/branches", { program_id: programId, page }),
    enabled: programId !== "",
  });
}

export function useSubjects(branchId: string, semester?: number, page = 1) {
  return useQuery({
    queryKey: queryKeys.subjects(branchId, semester, page),
    queryFn: () => api.get<Paginated<Subject>>("/api/subjects", { branch_id: branchId, semester, page }),
    enabled: branchId !== "",
  });
}
