import type { ReactNode } from "react";
import { EmptyState } from "@/components/layout/EmptyState";
import { useMyPermissions } from "./queries";

/**
 * Hides a page/section a permission doesn't cover. This is navigation
 * convenience, NOT security — every endpoint it fronts re-checks the same
 * permission server-side via requirePermission (see RoleGate, which does
 * the equivalent for the older domain-role nav).
 */
export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { data: permissions, isPending } = useMyPermissions();

  if (isPending) return <div className="text-text-muted">Loading…</div>;
  if (!permissions?.has(permission)) {
    return <EmptyState title="You don't have access to this" hint={`Requires the "${permission}" permission.`} />;
  }
  return <>{children}</>;
}
