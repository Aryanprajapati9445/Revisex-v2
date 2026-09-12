import { useBranches, usePrograms } from "@/features/taxonomy/queries";
import type { UserRole } from "@/lib/api-types";
import { PICKER_LIMIT } from "@/lib/query-keys";
import { nativeSelectClass } from "@/components/ui/native-select";

export const DOMAIN_ROLE_LABELS: Record<UserRole, string> = {
  superuser: "Superuser",
  program_admin: "Program admin",
  branch_admin: "Branch admin",
  student: "Student",
};

/**
 * Which scope columns a role is allowed to carry. This mirrors the
 * users_role_scope CHECK constraint and the backend's own
 * isRoleScopeCombinationValid — a role with the wrong combination is a 422, so
 * the form has to know the rule rather than let the user discover it.
 */
export function scopeFor(role: UserRole): "none" | "program" | "branch" {
  if (role === "superuser") return "none";
  return role === "program_admin" ? "program" : "branch";
}

/**
 * The roles an actor may assign. The API refuses "a role equal to or above your
 * own" with a 403, so offering those in the dropdown would only produce errors
 * on choices the UI itself suggested.
 *
 * The admin-panel surface (/api/admin/users, gated by users.update) deliberately
 * skips that hierarchy check, so a permission holder is offered everything; the
 * scoped /api/users surface enforces it.
 */
export function assignableRoles(actorRole: UserRole | null, enforceHierarchy: boolean): UserRole[] {
  const all: UserRole[] = ["superuser", "program_admin", "branch_admin", "student"];
  if (!enforceHierarchy || actorRole === null) return all;
  const rank: Record<UserRole, number> = { superuser: 4, program_admin: 3, branch_admin: 2, student: 1 };
  return all.filter((role) => rank[role] < rank[actorRole]);
}

/**
 * Turns a chosen role plus pickers into the exact (role, program_id, branch_id)
 * triple the API accepts — nulls included, so a promotion clears the column the
 * new role must not carry.
 */
export function scopePayload(
  role: UserRole,
  programId: string,
  branchId: string
): { role: UserRole; program_id: string | null; branch_id: string | null } {
  const scope = scopeFor(role);
  return {
    role,
    program_id: scope === "program" ? programId : null,
    branch_id: scope === "branch" ? branchId : null,
  };
}

export function isScopeComplete(role: UserRole, programId: string, branchId: string): boolean {
  const scope = scopeFor(role);
  if (scope === "none") return true;
  return scope === "program" ? programId !== "" : branchId !== "";
}

/**
 * The program/branch pickers a role needs, and only those. A branch role still
 * shows the program picker because branches are listed per program — it just
 * isn't submitted.
 */
export function RoleScopeFields({
  role,
  programId,
  branchId,
  onProgramChange,
  onBranchChange,
  idPrefix,
}: {
  role: UserRole;
  programId: string;
  branchId: string;
  onProgramChange: (value: string) => void;
  onBranchChange: (value: string) => void;
  idPrefix: string;
}) {
  const scope = scopeFor(role);
  const programs = usePrograms(1, PICKER_LIMIT);
  const branches = useBranches(scope === "branch" ? programId : "", 1, PICKER_LIMIT);

  if (scope === "none") {
    return (
      <p className="text-caption text-text-tertiary">
        A superuser is not attached to a program or branch — they administer the whole platform.
      </p>
    );
  }

  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-caption text-text-muted">Program</span>
        <select
          id={`${idPrefix}-program`}
          required
          value={programId}
          onChange={(event) => {
            onProgramChange(event.target.value);
            onBranchChange("");
          }}
          className={nativeSelectClass}
        >
          <option value="">Select a program</option>
          {programs.data?.items.map((program) => (
            <option key={program.id} value={program.id}>
              {program.code} — {program.name}
            </option>
          ))}
        </select>
      </label>

      {scope === "branch" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-caption text-text-muted">Branch</span>
          <select
            id={`${idPrefix}-branch`}
            required
            value={branchId}
            disabled={programId === ""}
            onChange={(event) => onBranchChange(event.target.value)}
            className={nativeSelectClass}
          >
            <option value="">{programId ? "Select a branch" : "Pick a program first"}</option>
            {branches.data?.items.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.code} — {branch.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}
