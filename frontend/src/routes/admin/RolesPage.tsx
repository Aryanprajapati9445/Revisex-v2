import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
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
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-label={`Edit ${role.name}`} className="w-full max-w-md rounded-panel bg-background p-6 shadow-floating">
        <h2 className="text-base font-medium">{role.name}</h2>
        {role.description && <p className="mt-1 text-caption text-text-tertiary">{role.description}</p>}

        <div className="mt-4 flex max-h-80 flex-col gap-2 overflow-y-auto">
          {catalog.data?.map((permission) => (
            <label key={permission.id} className="flex items-start gap-2 rounded-control px-2 py-1.5 hover:bg-surface">
              <input
                type="checkbox"
                checked={selected.has(permission.id)}
                onChange={() => toggle(permission.id)}
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
          <p role="alert" className="mt-3 text-caption text-status-rejected-fg">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-control px-2.5 py-1.5 text-ui text-text-muted hover:bg-surface">
            Cancel
          </button>
          <button
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
            className="rounded-full bg-accent px-4 py-2 text-ui font-medium text-white transition-colors duration-150 disabled:opacity-60"
          >
            {setPermissions.isPending ? "Saving…" : "Save permissions"}
          </button>
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-label="Create role" className="w-full max-w-md rounded-panel bg-background p-6 shadow-floating">
        <h2 className="text-base font-medium">Create role</h2>
        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-caption text-text-muted">Name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-control bg-surface px-2.5 py-1.5 text-ui outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-caption text-text-muted">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-control bg-surface px-2.5 py-1.5 text-ui outline-none"
            />
          </label>

          <div className="flex max-h-60 flex-col gap-2 overflow-y-auto">
            {catalog.data?.map((permission) => (
              <label key={permission.id} className="flex items-center gap-2 rounded-control px-2 py-1.5 hover:bg-surface">
                <input type="checkbox" checked={selected.has(permission.id)} onChange={() => toggle(permission.id)} />
                <span className="text-ui">{permission.id}</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-caption text-status-rejected-fg">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-control px-2.5 py-1.5 text-ui text-text-muted hover:bg-surface">
            Cancel
          </button>
          <button
            type="button"
            disabled={createRole.isPending || name.trim() === ""}
            onClick={handleSubmit}
            className="rounded-full bg-accent px-4 py-2 text-ui font-medium text-white transition-colors duration-150 disabled:opacity-60"
          >
            {createRole.isPending ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RolesList() {
  const roles = useRoles();
  const deleteRole = useDeleteRole();
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);

  if (roles.error) return <ErrorState error={roles.error} />;
  if (roles.isPending) return <div className="text-text-muted">Loading…</div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title font-bold">Roles & Permissions</h1>
          <p className="mt-1 text-lead text-text-muted">What each admin role may do.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-ui font-medium text-white transition-colors duration-150 hover:bg-accent/90"
        >
          <Plus className="size-4" strokeWidth={2} aria-hidden="true" />
          Create role
        </button>
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
                    <span className="flex items-center gap-1 rounded-control bg-surface px-1.5 py-0.5 text-caption text-text-muted">
                      <Lock className="size-3" strokeWidth={2} aria-hidden="true" />
                      system
                    </span>
                  )}
                </span>
                <span className="truncate text-caption text-text-tertiary">
                  {role.permissions.length === 0 ? "No permissions granted" : role.permissions.join(", ")}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(role)}
                  className="flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-ui text-text-muted transition-colors duration-150 hover:bg-surface"
                >
                  <Pencil className="size-3.5" strokeWidth={2} aria-hidden="true" />
                  Edit permissions
                </button>
                {!role.is_system && (
                  <button
                    type="button"
                    onClick={() => deleteRole.mutate(role.id)}
                    className="flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-ui text-text-muted transition-colors duration-150 hover:bg-status-rejected-bg hover:text-status-rejected-fg"
                  >
                    <Trash2 className="size-3.5" strokeWidth={2} aria-hidden="true" />
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && <RoleEditor role={editing} onClose={() => setEditing(null)} />}
      {creating && <CreateRoleForm onClose={() => setCreating(false)} />}
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
