import { useCapabilities } from "@/features/admin/capabilities";
import {
  useAdminUsers,
  useCreateAdminUser,
  useDeleteAdminUser,
  useUpdateAdminUser,
} from "@/features/admin/queries";
import { useCreateUser, useDeleteUser, useUpdateUser, useUsers } from "./queries";
import type { Paginated, User, UserRole } from "@/lib/api-types";
import type { UserFilters } from "@/lib/query-keys";

export interface AccountFilters extends UserFilters {
  program_id?: string;
}

export interface AccountScope {
  /**
   * "platform" — the RBAC surface (/api/admin/users, users.read). Reaches every
   * account and skips the role-hierarchy check, so any role is assignable.
   *
   * "scoped" — the domain-role surface (/api/users, requireRole). Reaches only
   * the actor's own program or branch and refuses a role at or above their own,
   * so the role dropdown has to be narrowed to match.
   *
   * These are two genuinely different authorities in this codebase, not two
   * paths to the same one. A program_admin holding no console role still
   * manages their own program's people through the second.
   */
  kind: "platform" | "scoped";
  enforcesRoleHierarchy: boolean;
  description: string;
}

/**
 * One accounts screen for both surfaces. Which one an account gets is decided
 * here, once, from its capabilities — so the page renders the same list, the
 * same filters and the same dialogs either way, and only its reach changes.
 */
export function useAccountManagement(filters: AccountFilters) {
  const capabilities = useCapabilities();
  const onPlatformSurface = capabilities.canReadUsers;

  // Exactly one of these runs; the other is disabled, so there is no second
  // request and no chance of the two answers racing into the same table.
  const platformList = useAdminUsers(filters, onPlatformSurface);
  const scopedList = useUsers(filters, !onPlatformSurface && capabilities.isManager);

  const createPlatform = useCreateAdminUser(filters);
  const createScoped = useCreateUser(filters);
  const updatePlatform = useUpdateAdminUser();
  const updateScoped = useUpdateUser();
  const deletePlatform = useDeleteAdminUser(filters);
  const deleteScoped = useDeleteUser(filters);

  const scope: AccountScope = onPlatformSurface
    ? {
        kind: "platform",
        enforcesRoleHierarchy: false,
        description: "Every account on the platform.",
      }
    : {
        kind: "scoped",
        enforcesRoleHierarchy: true,
        description:
          capabilities.role === "program_admin"
            ? "Accounts inside the program you administer."
            : "Accounts inside the branch you administer.",
      };

  const query = onPlatformSurface ? platformList : scopedList;

  return {
    scope,
    /** Neither surface is open to this account. */
    unavailable: !onPlatformSurface && !capabilities.isManager,
    data: query.data as Paginated<User> | undefined,
    error: query.error,
    isPending: query.isPending,
    isFetching: query.isFetching,

    create: onPlatformSurface ? createPlatform : createScoped,
    update: onPlatformSurface ? updatePlatform : updateScoped,
    remove: onPlatformSurface ? deletePlatform : deleteScoped,

    // The scoped surface has no separate create/update/delete permissions —
    // reaching it at all means holding them for your own scope.
    canCreate: onPlatformSurface ? capabilities.canCreateUsers : capabilities.isManager,
    canUpdate: onPlatformSurface ? capabilities.canUpdateUsers : capabilities.isManager,
    canDelete: onPlatformSurface ? capabilities.canDeleteUsers : capabilities.isManager,
    /** Console permissions are always the RBAC axis, whichever surface listed the user. */
    canManageConsoleRoles: capabilities.canManageRoles,
    actorRole: capabilities.role as UserRole | null,
  };
}
