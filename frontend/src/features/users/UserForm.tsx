import { useState, type FormEvent } from "react";
import { useAuth } from "@/features/auth/useAuth";
import { useBranches, usePrograms } from "@/features/taxonomy/queries";
import type { UserRole } from "@/lib/api-types";
import { PICKER_LIMIT } from "@/lib/query-keys";
import type { CreateUserInput } from "./queries";

// A branch_admin may only create students; a program_admin may also create
// branch_admins. The server enforces this — the select just avoids offering
// an option that is certain to be refused.
const ROLE_OPTIONS: Record<UserRole, UserRole[]> = {
  superuser: ["program_admin", "branch_admin", "student"],
  program_admin: ["branch_admin", "student"],
  branch_admin: ["student"],
  student: [],
};

const ROLE_LABELS: Record<UserRole, string> = {
  superuser: "Superuser",
  program_admin: "Program admin",
  branch_admin: "Branch admin",
  student: "Student",
};

/**
 * Mirrors the backend's users_role_scope rule: a program_admin is identified by
 * a program and no branch; branch_admins and students by a branch and no
 * program. The scope therefore describes the account being created, NOT the
 * admin creating it — deriving it from the actor is only ever correct for a
 * branch_admin adding a student to their own branch.
 */
function scopeFor(role: UserRole): "program" | "branch" {
  return role === "program_admin" ? "program" : "branch";
}

export function UserForm({
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  onSubmit: (input: CreateUserInput) => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
}) {
  const { user } = useAuth();
  const allowedRoles = user ? ROLE_OPTIONS[user.role] : [];

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(allowedRoles[0] ?? "student");

  // A branch_admin manages exactly one branch, so their target is fixed and no
  // picker is shown. Everyone else must choose.
  const actorBranchIsFixed = user?.role === "branch_admin";
  // A program_admin may only reach branches inside their own program, so the
  // program is pinned for them and only a superuser picks one.
  const programIsFixed = user?.role === "program_admin";

  const [programId, setProgramId] = useState(programIsFixed ? (user?.program_id ?? "") : "");
  const [branchId, setBranchId] = useState(actorBranchIsFixed ? (user?.branch_id ?? "") : "");

  const scope = scopeFor(role);
  const needsProgramPicker = !programIsFixed && (scope === "program" || !actorBranchIsFixed);
  const needsBranchPicker = scope === "branch" && !actorBranchIsFixed;

  const programs = usePrograms(1, PICKER_LIMIT);
  // Branches are always program-scoped on the API, so a branch cannot be listed
  // until a program is known.
  const branches = useBranches(needsBranchPicker ? programId : "", 1, PICKER_LIMIT);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      full_name: fullName,
      email,
      password,
      role,
      program_id: scope === "program" ? programId : null,
      branch_id: scope === "branch" ? (actorBranchIsFixed ? (user?.branch_id ?? null) : branchId) : null,
    });
  }

  const inputClass = "rounded-control bg-surface px-2.5 py-1.5 text-ui outline-none";
  const scopeIsChosen = scope === "program" ? programId !== "" : actorBranchIsFixed || branchId !== "";

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-label="Add user" className="w-full max-w-md rounded-panel bg-background p-6 shadow-floating">
        <h2 className="text-base font-medium">Add user</h2>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-caption text-text-muted">Full name</span>
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-caption text-text-muted">Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-caption text-text-muted">Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-caption text-text-muted">Role</span>
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value as UserRole);
                // The chosen branch may not apply to the new role's scope.
                if (!actorBranchIsFixed) setBranchId("");
              }}
              className={inputClass}
            >
              {allowedRoles.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABELS[option]}
                </option>
              ))}
            </select>
          </label>

          {needsProgramPicker && (
            <label className="flex flex-col gap-1.5">
              <span className="text-caption text-text-muted">Program</span>
              <select
                required
                value={programId}
                onChange={(e) => {
                  setProgramId(e.target.value);
                  setBranchId("");
                }}
                className={inputClass}
              >
                <option value="">Select a program</option>
                {programs.data?.items.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {needsBranchPicker && (
            <label className="flex flex-col gap-1.5">
              <span className="text-caption text-text-muted">Branch</span>
              <select
                required
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                disabled={programId === ""}
                className={inputClass}
              >
                <option value="">{programId ? "Select a branch" : "Pick a program first"}</option>
                {branches.data?.items.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && (
            <p role="alert" className="text-caption text-status-rejected-fg">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded-control px-2.5 py-1.5 text-ui text-text-muted hover:bg-surface">
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !scopeIsChosen}
              className="rounded-full bg-accent px-4 py-2 text-ui font-medium text-white transition-colors duration-150 disabled:opacity-60"
            >
              {pending ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
