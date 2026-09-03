import type { ReactNode } from "react";
import type { UserRole } from "@/lib/api-types";
import { useAuth } from "./useAuth";

/**
 * Hides UI a role cannot use. This is navigation convenience, NOT security —
 * every endpoint behind these controls re-checks role and scope server-side.
 */
export function RoleGate({ allow, children }: { allow: UserRole[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !allow.includes(user.role)) return null;
  return <>{children}</>;
}
