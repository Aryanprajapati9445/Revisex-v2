import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Paginated, User, UserRole } from "@/lib/api-types";
import { queryKeys, type UserFilters } from "@/lib/query-keys";

export function useUsers(filters: UserFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.users(filters),
    queryFn: () => api.get<Paginated<User>>("/api/users", { ...filters }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export interface UpdateUserInput {
  full_name?: string;
  role?: UserRole;
  /**
   * Sent together on any role change, nulls included: users_role_scope requires
   * an exact combination per role, so a leftover program_id is a 422.
   */
  program_id?: string | null;
  branch_id?: string | null;
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      api.patch<User>(`/api/users/${id}`, input),
    // Filters are part of the key, so the prefix covers whichever page is shown.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
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
