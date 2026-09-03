import { AlertCircle, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequirePermission } from "@/features/admin/RequirePermission";
import {
  usePermissionsCatalog,
  useCreateRole,
  useDeleteRole,
  useRoles,
  useSetRolePermissions,
  type CreateRoleInput,
} from "@/features/admin/queries";
import { ApiError } from "@/lib/api-client";
import type { Role } from "@/lib/api-types";

function RoleEditor({ role, onClose }: { role: Role; onClose: () => void }) {
  const catalog = usePermissionsCatalog();
  const setPermissions = useSetRolePermissions();
  const [selected, setSelected] = useState<Set<string>>(new Set(role.permissions));
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{role.name}</DialogTitle>
        </DialogHeader>
        {role.description && <p className="-mt-2 text-caption text-text-tertiary">{role.description}</p>}

        <div className="grid max-h-96 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
          {catalog.data?.map((permission) => (
            <label key={permission.id} className="flex items-start gap-2 rounded-control px-2 py-1.5 hover:bg-surface">
              <Checkbox
                checked={selected.has(permission.id)}
                onCheckedChange={() => toggle(permission.id)}
                className="mt-0.5"
              />
              <span className="flex flex-col">
                <span className="text-ui font-medium">{permission.id}</span>
                <span className="text-caption text-text-muted">{permission.description}</span>
              </span>
            </label>
          ))}
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
          <Button
            type="button"
            disabled={setPermissions.isPending}
            onClick={() =>
              setPermissions.mutate(
                { id: role.id, permissions: [...selected] },
                {
                  onSuccess: onClose,
                  onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Could not save permissions."),
                }
              )
            }
          >
            {setPermissions.isPending ? "Saving…" : "Save permissions"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateRoleForm({ onClose }: { onClose: () => void }) {
  const catalog = usePermissionsCatalog();
  const createRole = useCreateRole();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit() {
    const input: CreateRoleInput = { name, description: description || null, permissions: [...selected] };
    createRole.mutate(input, {
      onSuccess: onClose,
      onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Could not create the role."),
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create role</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role-name">Name</Label>
              <Input id="role-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role-description">Description</Label>
              <Input id="role-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {catalog.data?.map((permission) => (
              <label key={permission.id} className="flex items-center gap-2 rounded-control px-2 py-1.5 hover:bg-surface">
                <Checkbox checked={selected.has(permission.id)} onCheckedChange={() => toggle(permission.id)} />
                <span className="text-ui">{permission.id}</span>
              </label>
            ))}
          </div>
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
          <Button type="button" disabled={createRole.isPending || name.trim() === ""} onClick={handleSubmit}>
            {createRole.isPending ? "Creating…" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RolesList() {
  const roles = useRoles();
  const deleteRole = useDeleteRole();
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Role | null>(null);

  if (roles.error) return <ErrorState error={roles.error} />;
  if (roles.isPending) return <div className="text-text-muted">Loading…</div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title font-bold">Roles & Permissions</h1>
          <p className="mt-1 text-lead text-text-muted">What each admin role may do.</p>
        </div>
        <Button type="button" onClick={() => setCreating(true)}>
          <Plus className="size-4" strokeWidth={2} aria-hidden="true" />
          Create role
        </Button>
      </div>

      {roles.data.length === 0 ? (
        <EmptyState title="No roles yet" />
      ) : (
        <ul className="flex flex-col gap-2">
          {roles.data.map((role) => (
            <li
              key={role.id}
              className="flex flex-col gap-2 rounded-card bg-background p-4 shadow-raised transition-all duration-200 hover:-translate-y-0.5 hover:shadow-floating sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 text-ui font-medium">
                  {role.name}
                  {role.is_system && (
                    <Badge variant="secondary">
                      <Lock className="size-3" strokeWidth={2} aria-hidden="true" />
                      system
                    </Badge>
                  )}
                </span>
                <span className="truncate text-caption text-text-tertiary">
                  {role.permissions.length === 0 ? "No permissions granted" : role.permissions.join(", ")}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(role)}>
                  <Pencil className="size-3.5" strokeWidth={2} aria-hidden="true" />
                  Edit permissions
                </Button>
                {!role.is_system && (
                  <Button type="button" variant="ghost-destructive" size="sm" onClick={() => setDeleting(role)}>
                    <Trash2 className="size-3.5" strokeWidth={2} aria-hidden="true" />
                    Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && <RoleEditor role={editing} onClose={() => setEditing(null)} />}
      {creating && <CreateRoleForm onClose={() => setCreating(false)} />}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Any user holding only this role loses the permissions it granted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteRole.isPending}
              onClick={() => {
                if (deleting) deleteRole.mutate(deleting.id, { onSettled: () => setDeleting(null) });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function RolesPage() {
  return (
    <RequirePermission permission="roles.manage">
      <RolesList />
    </RequirePermission>
  );
}
