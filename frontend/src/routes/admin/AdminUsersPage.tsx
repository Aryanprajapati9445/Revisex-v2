import { AlertCircle, MoreHorizontal, ShieldCheck, Trash2, UserCog, UserPlus } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ConfirmDestructive } from "@/components/admin/ConfirmDestructive";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Pagination } from "@/components/layout/Pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/ui/search-input";
import { useRoles, useSetUserRoles, useUserRoles, type CreateAdminUserInput } from "@/features/admin/queries";
import { useAccountManagement } from "@/features/users/account-management";
import {
  DOMAIN_ROLE_LABELS,
  RoleScopeFields,
  assignableRoles,
  isScopeComplete,
  scopeFor,
  scopePayload,
} from "@/features/users/RoleScopeFields";
import { usePrograms } from "@/features/taxonomy/queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiError } from "@/lib/api-client";
import type { User, UserRole } from "@/lib/api-types";
import { PICKER_LIMIT } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

const ROLE_TONE: Record<UserRole, string> = {
  superuser: "bg-accent text-accent-foreground",
  program_admin: "bg-status-approved-bg text-status-approved-fg",
  branch_admin: "bg-status-pending-bg text-status-pending-fg",
  student: "bg-background text-text-muted",
};

const selectClass = "rounded-control bg-surface px-2.5 py-1.5 text-ui text-text-primary outline-none";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/** Create and edit share one form: the fields differ only by the password. */
function UserDialog({
  mode,
  user,
  onClose,
  manager,
}: {
  mode: "create" | "edit";
  user?: User;
  onClose: () => void;
  manager: ReturnType<typeof useAccountManagement>;
}) {
  const createUser = manager.create;
  const updateUser = manager.update;

  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(user?.role ?? "student");
  const [programId, setProgramId] = useState(user?.program_id ?? "");
  const [branchId, setBranchId] = useState(user?.branch_id ?? "");
  const [error, setError] = useState<string | null>(null);

  // Only the scoped surface refuses "a role equal to or above your own"; the
  // permission-gated one authorises by permission alone. Offering a role the
  // active surface would reject turns a legitimate choice into a 403.
  const roles = assignableRoles(manager.actorRole, manager.scope.enforcesRoleHierarchy);
  const pending = mode === "create" ? createUser.isPending : updateUser.isPending;
  const complete =
    fullName.trim() !== "" &&
    isScopeComplete(role, programId, branchId) &&
    (mode === "edit" || (email.trim() !== "" && password.length >= 8));

  function handleSubmit() {
    setError(null);
    const scope = scopePayload(role, programId, branchId);

    if (mode === "create") {
      const input: CreateAdminUserInput = { full_name: fullName, email, password, ...scope };
      createUser.mutate(input, {
        onSuccess: onClose,
        onError: (err: unknown) => setError(errorMessage(err, "Could not create the account.")),
      });
      return;
    }

    updateUser.mutate(
      { id: user!.id, input: { full_name: fullName, ...scope } },
      {
        onSuccess: onClose,
        onError: (err: unknown) => setError(errorMessage(err, "Could not save the account.")),
      }
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add user" : `Edit ${user?.full_name ?? "user"}`}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-full-name">Full name</Label>
            <Input
              id="user-full-name"
              required
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-email">Email</Label>
            <Input
              id="user-email"
              type="email"
              required={mode === "create"}
              disabled={mode === "edit"}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {mode === "edit" && (
              <span className="text-caption text-text-tertiary">
                An account's email is its identity here and cannot be reassigned.
              </span>
            )}
          </div>

          {mode === "create" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-password">Password</Label>
              <Input
                id="user-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <span className="text-caption text-text-tertiary">At least 8 characters.</span>
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-caption text-text-muted">Domain role</span>
            <select
              value={role}
              onChange={(event) => {
                const next = event.target.value as UserRole;
                setRole(next);
                // The old scope is invalid for the new role more often than not,
                // and sending a stale program_id with a branch role is a 422.
                if (scopeFor(next) !== scopeFor(role)) {
                  setProgramId("");
                  setBranchId("");
                }
              }}
              className={selectClass}
            >
              {roles.map((option) => (
                <option key={option} value={option}>
                  {DOMAIN_ROLE_LABELS[option]}
                </option>
              ))}
            </select>
            <span className="text-caption text-text-tertiary">
              Controls what this account can reach: a program admin owns one program's branches, a branch admin one
              branch's subjects.
            </span>
          </label>

          <RoleScopeFields
            role={role}
            programId={programId}
            branchId={branchId}
            onProgramChange={setProgramId}
            onBranchChange={setBranchId}
            idPrefix="user"
          />
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
          <Button type="button" disabled={pending || !complete} onClick={handleSubmit}>
            {pending ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
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
    const next = new Set(effectiveSelected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Admin roles — {user.full_name}</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-caption text-text-tertiary">
          Console permissions, separate from their domain role ({DOMAIN_ROLE_LABELS[user.role]}). One decides what
          they administer, the other what the console lets them open.
        </p>

        {currentRoles.isPending || allRoles.isPending ? (
          <div className="text-text-muted">Loading…</div>
        ) : (
          <div className="flex flex-col gap-2">
            {allRoles.data?.map((role) => (
              <label key={role.id} className="flex items-start gap-2 rounded-control px-2 py-1.5 hover:bg-surface">
                <Checkbox
                  className="mt-0.5"
                  checked={effectiveSelected.has(role.id)}
                  onCheckedChange={() => toggle(role.id)}
                />
                <span className="flex flex-col">
                  <span className="text-ui">{role.name}</span>
                  {role.description && <span className="text-caption text-text-tertiary">{role.description}</span>}
                </span>
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
                onError: (err: unknown) => setError(errorMessage(err, "Could not save roles.")),
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

/** memo: the list re-renders on every keystroke in the shared search box. */
const UserRow = memo(function UserRow({
  user,
  canUpdate,
  canDelete,
  canManageRoles,
  onEdit,
  onManageRoles,
  onDelete,
}: {
  user: User;
  canUpdate: boolean;
  canDelete: boolean;
  canManageRoles: boolean;
  onEdit: (user: User) => void;
  onManageRoles: (user: User) => void;
  onDelete: (user: User) => void;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-surface-elevated">
      <Avatar className="size-8 shrink-0">
        <AvatarFallback>{initials(user.full_name)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-ui font-medium text-text-primary">{user.full_name}</span>
        <span className="truncate font-mono text-caption text-text-tertiary">{user.email}</span>
      </div>
      <span
        className={cn(
          "ml-auto shrink-0 rounded-control px-1.5 py-0.5 text-caption font-medium",
          ROLE_TONE[user.role]
        )}
      >
        {DOMAIN_ROLE_LABELS[user.role]}
      </span>

      {(canUpdate || canDelete || canManageRoles) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.full_name}`}>
              <MoreHorizontal className="size-4" strokeWidth={2} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canUpdate && (
              <DropdownMenuItem onSelect={() => onEdit(user)}>
                <UserCog className="size-3.5" strokeWidth={2} aria-hidden="true" />
                Edit role & scope
              </DropdownMenuItem>
            )}
            {canManageRoles && (
              <DropdownMenuItem onSelect={() => onManageRoles(user)}>
                <ShieldCheck className="size-3.5" strokeWidth={2} aria-hidden="true" />
                Console permissions
              </DropdownMenuItem>
            )}
            {canDelete && <DropdownMenuSeparator />}
            {canDelete && (
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(user)}>
                <Trash2 className="size-3.5" strokeWidth={2} aria-hidden="true" />
                Remove account
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
});

export function AdminUsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const roleFilter = (searchParams.get("role") ?? "") as UserRole | "";
  const programFilter = searchParams.get("program") ?? "";
  const urlQuery = searchParams.get("q") ?? "";
  const [page, setPage] = useState(1);

  const [term, setTerm] = useState(urlQuery);
  const debouncedTerm = useDebouncedValue(term);

  const setParam = useCallback(
    (updates: Record<string, string | null>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(updates)) {
            if (value === null || value === "") next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true }
      );
      // Reset paging here, in the event that changed the filter, rather than in
      // an effect watching the URL: a narrowed filter usually has fewer pages
      // than the one currently shown.
      setPage(1);
    },
    [setSearchParams]
  );

  useEffect(() => {
    if (debouncedTerm !== urlQuery) setParam({ q: debouncedTerm || null });
  }, [debouncedTerm, urlQuery, setParam]);

  const filters = useMemo(
    () => ({
      page,
      role: roleFilter || undefined,
      program_id: programFilter || undefined,
      q: urlQuery || undefined,
    }),
    [page, roleFilter, programFilter, urlQuery]
  );

  const manager = useAccountManagement(filters);
  const deleteUser = manager.remove;
  const programs = usePrograms(1, PICKER_LIMIT);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [managingRolesFor, setManagingRolesFor] = useState<User | null>(null);
  const [confirming, setConfirming] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleEdit = useCallback((user: User) => setEditing(user), []);
  const handleManageRoles = useCallback((user: User) => setManagingRolesFor(user), []);
  const handleDelete = useCallback((user: User) => {
    setDeleteError(null);
    setConfirming(user);
  }, []);

  const filtersApplied = roleFilter !== "" || programFilter !== "" || urlQuery !== "";

  if (manager.unavailable) {
    return (
      <EmptyState
        title="You don't have access to accounts"
        hint="Managing people needs either the users.read console permission or an administrator role over a program or branch."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Accounts"
        description={`${manager.scope.description} Their domain role decides what they administer; console permissions decide what the console lets them open.`}
        action={
          manager.canCreate ? (
            <Button type="button" onClick={() => setCreating(true)}>
              <UserPlus className="size-4" strokeWidth={2} aria-hidden="true" />
              Add user
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={term}
          onChange={setTerm}
          placeholder="Search by name or email…"
          className="max-w-sm"
        />
        <label className="flex items-center gap-2">
          <span className="text-caption text-text-muted">Role</span>
          <select
            value={roleFilter}
            onChange={(event) => setParam({ role: event.target.value })}
            className={selectClass}
          >
            <option value="">All roles</option>
            {(["superuser", "program_admin", "branch_admin", "student"] as UserRole[]).map((role) => (
              <option key={role} value={role}>
                {DOMAIN_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-caption text-text-muted">Program</span>
          <select
            value={programFilter}
            onChange={(event) => setParam({ program: event.target.value })}
            className={selectClass}
          >
            <option value="">All programs</option>
            {programs.data?.items.map((program) => (
              <option key={program.id} value={program.id}>
                {program.code}
              </option>
            ))}
          </select>
        </label>
        {filtersApplied && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setTerm("");
              setParam({ role: null, program: null, q: null });
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {manager.error ? (
        <ErrorState error={manager.error} />
      ) : manager.isPending || !manager.data ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} data-skeleton-block className="h-14 animate-pulse rounded-card bg-surface" />
          ))}
        </div>
      ) : manager.data.items.length === 0 ? (
        <EmptyState
          title={filtersApplied ? "No accounts matched" : "No users yet"}
          hint={filtersApplied ? "Try a broader filter." : undefined}
        />
      ) : (
        <>
          <ul
            className={cn(
              "flex flex-col divide-y divide-border rounded-card bg-surface transition-opacity duration-150",
              // keepPreviousData keeps the old rows on screen during a refetch;
              // dimming them says "this is the previous answer" without the
              // layout jump an empty state would cause.
              manager.isFetching && "opacity-60"
            )}
          >
            {manager.data.items.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                canUpdate={manager.canUpdate}
                canDelete={manager.canDelete}
                canManageRoles={manager.canManageConsoleRoles}
                onEdit={handleEdit}
                onManageRoles={handleManageRoles}
                onDelete={handleDelete}
              />
            ))}
          </ul>
          <Pagination meta={manager.data.pagination} onPageChange={setPage} />
        </>
      )}

      {creating && <UserDialog mode="create" manager={manager} onClose={() => setCreating(false)} />}
      {editing && (
        <UserDialog
          key={editing.id}
          mode="edit"
          user={editing}
          manager={manager}
          onClose={() => setEditing(null)}
        />
      )}
      {managingRolesFor && (
        <ManageRolesForm user={managingRolesFor} onClose={() => setManagingRolesFor(null)} />
      )}

      <ConfirmDestructive
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title={`Remove ${confirming?.full_name ?? "this account"}?`}
        description="The account is deleted and they lose access immediately. Notes they uploaded stay on the platform, with their name removed from the audit trail."
        confirmationCode={confirming?.email ?? ""}
        confirmLabel="Remove account"
        pending={deleteUser.isPending}
        error={deleteError}
        onConfirm={() => {
          if (!confirming) return;
          deleteUser.mutate(confirming.id, {
            onSuccess: () => setConfirming(null),
            onError: (error: unknown) => setDeleteError(errorMessage(error, "Could not remove the account.")),
          });
        }}
      />
    </div>
  );
}
