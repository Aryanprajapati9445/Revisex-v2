import { AlertCircle, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { Pagination } from "@/components/layout/Pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequirePermission } from "@/features/admin/RequirePermission";
import {
  useAdminUsers,
  useCreateAdminUser,
  useDeleteAdminUser,
  useMyPermissions,
  useRoles,
  useSetUserRoles,
  useUserRoles,
  type CreateAdminUserInput,
} from "@/features/admin/queries";
import { usePrograms, useBranches } from "@/features/taxonomy/queries";
import { ApiError } from "@/lib/api-client";
import type { User, UserRole } from "@/lib/api-types";
import { PICKER_LIMIT } from "@/lib/query-keys";

const DOMAIN_ROLE_OPTIONS: UserRole[] = ["superuser", "program_admin", "branch_admin", "student"];
const DOMAIN_ROLE_LABELS: Record<UserRole, string> = {
  superuser: "Superuser",
  program_admin: "Program admin",
  branch_admin: "Branch admin",
  student: "Student",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

function scopeFor(role: UserRole): "none" | "program" | "branch" {
  if (role === "superuser") return "none";
  return role === "program_admin" ? "program" : "branch";
}

function CreateAdminUserForm({ onClose, filters }: { onClose: () => void; filters: { page: number } }) {
  const createUser = useCreateAdminUser(filters);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("student");
  const [programId, setProgramId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const scope = scopeFor(role);
  const programs = usePrograms(1, PICKER_LIMIT);
  const branches = useBranches(scope === "branch" ? programId : "", 1, PICKER_LIMIT);
  const scopeIsChosen = scope === "none" || (scope === "program" ? programId !== "" : branchId !== "");

  function handleSubmit() {
    const input: CreateAdminUserInput = {
      full_name: fullName,
      email,
      password,
      role,
      program_id: scope === "program" ? programId : null,
      branch_id: scope === "branch" ? branchId : null,
    };
    createUser.mutate(input, {
      onSuccess: onClose,
      onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Could not create the account."),
    });
  }

  // Native <select>, not the shadcn Select: kept consistent with the
  // identical picker in UserForm.tsx, and plain enough not to need one.
  const selectClass = "rounded-control bg-surface px-2.5 py-1.5 text-ui outline-none";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admin-user-full-name">Full name</Label>
            <Input id="admin-user-full-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admin-user-email">Email</Label>
            <Input id="admin-user-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admin-user-password">Password</Label>
            <Input
              id="admin-user-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-caption text-text-muted">Domain role</span>
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value as UserRole);
                setProgramId("");
                setBranchId("");
              }}
              className={selectClass}
            >
              {DOMAIN_ROLE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {DOMAIN_ROLE_LABELS[option]}
                </option>
              ))}
            </select>
          </label>

          {scope === "program" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-caption text-text-muted">Program</span>
              <select required value={programId} onChange={(e) => setProgramId(e.target.value)} className={selectClass}>
                <option value="">Select a program</option>
                {programs.data?.items.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {scope === "branch" && (
            <>
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
              <label className="flex flex-col gap-1.5">
                <span className="text-caption text-text-muted">Branch</span>
                <select required value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={programId === ""} className={selectClass}>
                  <option value="">{programId ? "Select a branch" : "Pick a program first"}</option>
                  {branches.data?.items.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={createUser.isPending || !scopeIsChosen} onClick={handleSubmit}>
            {createUser.isPending ? "Creating…" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManageRolesForm({ user, onClose }: { user: User; onClose: () => void }) {
  const allRoles = useRoles();
  const currentRoles = useUserRoles(user.id);
  const setUserRoles = useSetUserRoles(user.id);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveSelected = selected ?? new Set(currentRoles.data?.map((r) => r.id) ?? []);

  function toggle(id: string) {
    setSelected(() => {
      const next = new Set(effectiveSelected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Admin roles — {user.full_name}</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-caption text-text-tertiary">Separate from their domain role ({user.role}).</p>

        {currentRoles.isPending || allRoles.isPending ? (
          <div className="text-text-muted">Loading…</div>
        ) : (
          <div className="flex flex-col gap-2">
            {allRoles.data?.map((role) => (
              <label key={role.id} className="flex items-center gap-2 rounded-control px-2 py-1.5 hover:bg-surface">
                <Checkbox checked={effectiveSelected.has(role.id)} onCheckedChange={() => toggle(role.id)} />
                <span className="text-ui">{role.name}</span>
              </label>
            ))}
          </div>
        )}

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={setUserRoles.isPending}
            onClick={() =>
              setUserRoles.mutate([...effectiveSelected], {
                onSuccess: onClose,
                onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Could not save roles."),
              })
            }
          >
            {setUserRoles.isPending ? "Saving…" : "Save roles"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AdminUsersList() {
  const [page, setPage] = useState(1);
  const filters = { page };
  const users = useAdminUsers(filters);
  const deleteUser = useDeleteAdminUser(filters);
  const { data: permissions } = useMyPermissions();

  const [adding, setAdding] = useState(false);
  const [managingRolesFor, setManagingRolesFor] = useState<User | null>(null);
  const [confirming, setConfirming] = useState<User | null>(null);

  const canCreate = permissions?.has("users.create") ?? false;
  const canDelete = permissions?.has("users.delete") ?? false;
  const canManageRoles = permissions?.has("roles.manage") ?? false;

  if (users.error) return <ErrorState error={users.error} />;
  if (users.isPending) return <div className="text-text-muted">Loading…</div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title font-bold">Users</h1>
          <p className="mt-1 text-lead text-text-muted">Every account on the platform.</p>
        </div>
        {canCreate && (
          <Button type="button" onClick={() => setAdding(true)}>
            <UserPlus className="size-4" strokeWidth={2} aria-hidden="true" />
            Add user
          </Button>
        )}
      </div>

      {users.data.items.length === 0 ? (
        <EmptyState title="No users yet" />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {users.data.items.map((user) => (
              <li
                key={user.id}
                className="flex items-center gap-4 rounded-card bg-background p-4 shadow-raised transition-all duration-200 hover:-translate-y-0.5 hover:shadow-floating"
              >
                <Avatar>
                  <AvatarFallback>{initials(user.full_name)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-ui font-medium">{user.full_name}</span>
                  <span className="truncate text-caption text-text-tertiary">{user.email}</span>
                </div>
                <span className="ml-auto rounded-control bg-surface px-1.5 py-0.5 text-caption text-text-muted">
                  {DOMAIN_ROLE_LABELS[user.role]}
                </span>
                {canManageRoles && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setManagingRolesFor(user)}>
                    <ShieldCheck className="size-3.5" strokeWidth={2} aria-hidden="true" />
                    Admin roles
                  </Button>
                )}
                {canDelete && (
                  <Button type="button" variant="ghost-destructive" size="sm" onClick={() => setConfirming(user)}>
                    <Trash2 className="size-3.5" strokeWidth={2} aria-hidden="true" />
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <Pagination meta={users.data.pagination} onPageChange={setPage} />
        </>
      )}

      {adding && <CreateAdminUserForm filters={filters} onClose={() => setAdding(false)} />}
      {managingRolesFor && <ManageRolesForm user={managingRolesFor} onClose={() => setManagingRolesFor(null)} />}

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {confirming?.full_name}?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteUser.isPending}
              onClick={() => {
                if (confirming) deleteUser.mutate(confirming.id, { onSettled: () => setConfirming(null) });
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function AdminUsersPage() {
  return (
    <RequirePermission permission="users.read">
      <AdminUsersList />
    </RequirePermission>
  );
}
