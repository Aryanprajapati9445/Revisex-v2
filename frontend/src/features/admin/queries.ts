import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/useAuth";
import { api } from "@/lib/api-client";
import type { AuditLogEntry, Paginated, Permission, Role, User, UserRole } from "@/lib/api-types";
import { queryKeys, type AuditLogFilters, type UserFilters } from "@/lib/query-keys";

/**
 * The current user's resolved admin permission set. Drives nav/UI show-hide
 * ONLY — every endpoint it gates re-checks server-side via requirePermission.
 * Any authenticated user can call this; it returns an empty list for one
 * holding no admin role.
 */
export function useMyPermissions() {
  const { status } = useAuth();
  return useQuery({
    queryKey: queryKeys.myPermissions,
    queryFn: () => api.get<{ permissions: string[] }>("/api/admin/permissions/me"),
    select: (data) => new Set(data.permissions),
    enabled: status === "authenticated",
  });
}

export function usePermissionsCatalog() {
  return useQuery({
    queryKey: queryKeys.permissionsCatalog,
    queryFn: () => api.get<Permission[]>("/api/admin/permissions"),
  });
}

export function useRoles() {
  return useQuery({
    queryKey: queryKeys.roles,
    queryFn: () => api.get<Role[]>("/api/admin/roles"),
  });
}

export interface CreateRoleInput {
  name: string;
  description?: string | null;
  permissions: string[];
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoleInput) => api.post<Role>("/api/admin/roles", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.roles }),
  });
}

export interface UpdateRoleInput {
  name?: string;
  description?: string | null;
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRoleInput }) => api.patch<Role>(`/api/admin/roles/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.roles }),
  });
}

export function useSetRolePermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: string[] }) =>
      api.put<Role>(`/api/admin/roles/${id}/permissions`, { permissions }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.roles }),
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<null>(`/api/admin/roles/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.roles }),
  });
}

export function useUserRoles(userId: string) {
  return useQuery({
    queryKey: queryKeys.userRoles(userId),
    queryFn: () => api.get<Role[]>(`/api/admin/users/${userId}/roles`),
    enabled: userId !== "",
  });
}

export function useSetUserRoles(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roleIds: string[]) => api.put<Role[]>(`/api/admin/users/${userId}/roles`, { roles: roleIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.userRoles(userId) }),
  });
}

export function useAdminUsers(filters: UserFilters) {
  return useQuery({
    queryKey: queryKeys.adminUsers(filters),
    queryFn: () => api.get<Paginated<User>>("/api/admin/users", { ...filters }),
  });
}

export interface CreateAdminUserInput {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  program_id?: string | null;
  branch_id?: string | null;
  enrollment_year?: number | null;
}

export function useCreateAdminUser(filters: UserFilters) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAdminUserInput) => api.post<User>("/api/admin/users", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers(filters) }),
  });
}

export function useDeleteAdminUser(filters: UserFilters) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<null>(`/api/admin/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers(filters) }),
  });
}

export function useAuditLog(filters: AuditLogFilters) {
  return useQuery({
    queryKey: queryKeys.auditLog(filters),
    queryFn: () => api.get<Paginated<AuditLogEntry>>("/api/admin/audit-log", { ...filters }),
  });
}
