import { AlertCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  // Native <select>, not the shadcn Select: kept for plain, testable
  // keyboard/selectOptions interaction — no listbox behavior is needed here.
  const selectClass =
    "rounded-control bg-surface px-2.5 py-1.5 text-ui outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const scopeIsChosen = scope === "program" ? programId !== "" : actorBranchIsFixed || branchId !== "";

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-full-name">Full name</Label>
            <Input id="user-full-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-email">Email</Label>
            <Input id="user-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-password">Password</Label>
            <Input
              id="user-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-caption text-text-muted">Role</span>
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value as UserRole);
                // The chosen branch may not apply to the new role's scope.
                if (!actorBranchIsFixed) setBranchId("");
              }}
              className={selectClass}
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
                className={selectClass}
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
                className={selectClass}
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
            <Alert variant="destructive" role="alert">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !scopeIsChosen}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
