import { useState } from "react";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { Pagination } from "@/components/layout/Pagination";
import { UserForm } from "@/features/users/UserForm";
import { useCreateUser, useDeleteUser, useUsers } from "@/features/users/queries";
import { ApiError } from "@/lib/api-client";
import type { User } from "@/lib/api-types";

const ROLE_LABELS: Record<User["role"], string> = {
  superuser: "Superuser",
  program_admin: "Program admin",
  branch_admin: "Branch admin",
  student: "Student",
};

export function UsersPage() {
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<User | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const filters = { page };
  const users = useUsers(filters);
  const createUser = useCreateUser(filters);
  const deleteUser = useDeleteUser(filters);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title font-bold">Users</h1>
          <p className="mt-1 text-lead text-text-muted">Accounts inside your scope.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setAdding(true);
          }}
          className="rounded-full bg-accent px-4 py-2 text-ui font-medium text-white transition-colors duration-150"
        >
          Add user
        </button>
      </div>

      {users.error ? (
        <ErrorState error={users.error} />
      ) : users.isPending ? (
        <div className="text-text-muted">Loading…</div>
      ) : users.data.items.length === 0 ? (
        <EmptyState title="No users in scope" />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {users.data.items.map((user) => (
              <li key={user.id} className="flex items-center gap-4 rounded-card bg-background p-4 shadow-raised">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-ui font-medium">{user.full_name}</span>
                  <span className="truncate text-caption text-text-tertiary">{user.email}</span>
                </div>
                <span className="ml-auto rounded-control bg-surface px-1.5 py-0.5 text-caption text-text-muted">
                  {ROLE_LABELS[user.role]}
                </span>
                <button
                  type="button"
                  onClick={() => setConfirming(user)}
                  className="rounded-control px-2.5 py-1.5 text-ui text-text-muted transition-colors duration-150 hover:bg-status-rejected-bg hover:text-status-rejected-fg"
                >
                  Remove {user.full_name}
                </button>
              </li>
            ))}
          </ul>
          <Pagination meta={users.data.pagination} onPageChange={setPage} />
        </>
      )}

      {adding && (
        <UserForm
          pending={createUser.isPending}
          error={formError}
          onCancel={() => setAdding(false)}
          onSubmit={(input) =>
            createUser.mutate(input, {
              onSuccess: () => setAdding(false),
              onError: (error: unknown) =>
                setFormError(error instanceof ApiError ? error.message : "Could not create the account."),
            })
          }
        />
      )}

      {confirming && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" aria-label="Confirm removal" className="w-full max-w-sm rounded-panel bg-background p-6 shadow-floating">
            <h2 className="text-base font-medium">Remove {confirming.full_name}?</h2>
            <p className="mt-1 text-ui text-text-muted">
              Their uploaded notes stay on the platform; the account is removed.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded-control px-2.5 py-1.5 text-ui text-text-muted hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteUser.isPending}
                onClick={() =>
                  deleteUser.mutate(confirming.id, { onSettled: () => setConfirming(null) })
                }
                className="rounded-full bg-accent px-4 py-2 text-ui font-medium text-white transition-colors duration-150 disabled:opacity-60"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
