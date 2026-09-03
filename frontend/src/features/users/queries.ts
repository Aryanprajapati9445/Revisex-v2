import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Paginated, User, UserRole } from "@/lib/api-types";
import { queryKeys, type UserFilters } from "@/lib/query-keys";

export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: queryKeys.users(filters),
    queryFn: () => api.get<Paginated<User>>("/api/users", { ...filters }),
  });
}

export interface CreateUserInput {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  branch_id?: string | null;
  program_id?: string | null;
}

export function useCreateUser(filters: UserFilters) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => api.post<User>("/api/users", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.users(filters) }),
  });
}

export function useDeleteUser(filters: UserFilters) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<null>(`/api/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.users(filters) }),
  });
}
