import { useState } from "react";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { Pagination } from "@/components/layout/Pagination";
import { Reveal } from "@/components/motion/Reveal";
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
import { Button } from "@/components/ui/button";
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
    <Reveal className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title font-bold">Users</h1>
          <p className="mt-1 text-lead text-text-muted">Accounts inside your scope.</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setFormError(null);
            setAdding(true);
          }}
        >
          Add user
        </Button>
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
                <Button type="button" variant="ghost-destructive" size="sm" onClick={() => setConfirming(user)}>
                  Remove {user.full_name}
                </Button>
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

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {confirming?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their uploaded notes stay on the platform; the account is removed.
            </AlertDialogDescription>
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
    </Reveal>
  );
}
