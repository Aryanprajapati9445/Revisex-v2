import { useMyPermissions } from "./queries";
import { useAuth } from "@/features/auth/useAuth";
import type { UserRole } from "@/lib/api-types";

/**
 * This app gates on two unrelated axes, and mixing them ad-hoc in components is
 * how they drift apart:
 *
 *   - `users.role` is content scope — which program or branch you own. It gates
 *     the taxonomy, moderation and upload surfaces.
 *   - the RBAC permission set is dashboard capability. It gates accounts, roles
 *     and the audit log.
 *
 * Every console screen and every nav item reads its answer from here, so there
 * is exactly one place that knows which axis governs which surface. None of it
 * is security: each endpoint re-checks server-side (requireRole + scope, or
 * requirePermission). This decides what to *show*.
 */
export interface Capabilities {
  /** Still resolving the permission set; render skeletons, not an empty nav. */
  isLoading: boolean;
  role: UserRole | null;
  isManager: boolean;

  canManagePrograms: boolean;
  canManageBranches: boolean;
  /** Rename only — deactivating a branch is a program_admin's call. */
  canDeactivateBranches: boolean;
  canManageSubjects: boolean;
  canModerate: boolean;
  /** Whether the upload picker may reach outside the user's own branch. */
  canUploadBeyondOwnBranch: boolean;

  canReadUsers: boolean;
  canCreateUsers: boolean;
  canUpdateUsers: boolean;
  canDeleteUsers: boolean;
  canManageRoles: boolean;
  canReadAudit: boolean;

  /** "Platform-wide" / "Your program" / "Your branch" — shown in the sidebar. */
  scopeLabel: string;
}

const MANAGER_ROLES: UserRole[] = ["superuser", "program_admin", "branch_admin"];

export function useCapabilities(): Capabilities {
  const { user, status } = useAuth();
  const { data: permissions, isPending } = useMyPermissions();

  const role = user?.role ?? null;
  const isManager = role !== null && MANAGER_ROLES.includes(role);
  const has = (permission: string) => permissions?.has(permission) ?? false;

  return {
    // Both stages count, in this order:
    //
    //  - while the session itself is resolving, nothing is known yet. Skipping
    //    this made the console paint "you don't have access" against the
    //    not-yet-loaded user, then flip to a spinner, then back — a flash of
    //    the wrong answer on every load.
    //  - once authenticated, the permission set is still in flight.
    //
    // An anonymous visitor is neither: useMyPermissions stays disabled and
    // therefore pending forever, so they are "resolved with nothing".
    isLoading: status === "loading" || (user !== null && isPending),
    role,
    isManager,

    canManagePrograms: role === "superuser",
    canManageBranches: role === "superuser" || role === "program_admin",
    canDeactivateBranches: role === "superuser" || role === "program_admin",
    canManageSubjects: isManager,
    canModerate: isManager,
    canUploadBeyondOwnBranch: role === "superuser" || role === "program_admin",

    canReadUsers: has("users.read"),
    canCreateUsers: has("users.create"),
    canUpdateUsers: has("users.update"),
    canDeleteUsers: has("users.delete"),
    canManageRoles: has("roles.manage"),
    canReadAudit: has("audit.read"),

    scopeLabel:
      role === "superuser"
        ? "Platform-wide"
        : role === "program_admin"
          ? "Your program"
          : role === "branch_admin"
            ? "Your branch"
            : "Your account",
  };
}
