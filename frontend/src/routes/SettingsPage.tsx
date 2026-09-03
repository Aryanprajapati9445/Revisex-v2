import { useMutation } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/useAuth";
import { ApiError, api } from "@/lib/api-client";
import type { User } from "@/lib/api-types";

const ROLE_LABELS: Record<User["role"], string> = {
  superuser: "Superuser",
  program_admin: "Program admin",
  branch_admin: "Branch admin",
  student: "Student",
};

export function SettingsPage() {
  const { user } = useAuth();
  if (!user) return <div className="text-text-muted">Loading…</div>;
  // Keyed by id so the field re-seeds if the signed-in account changes. The
  // form mounts only once the user is loaded, so its initial state is seeded
  // exactly once — an effect that re-seeded it later could land mid-keystroke
  // and prefix whatever the person had already typed.
  return <SettingsForm key={user.id} user={user} />;
}

function SettingsForm({ user }: { user: User }) {
  const [fullName, setFullName] = useState(user.full_name);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (name: string) => api.patch<User>("/api/users/me", { full_name: name }),
    onSuccess: () => {
      setSaved(true);
      setError(null);
    },
    onError: (err: unknown) => {
      setSaved(false);
      setError(err instanceof ApiError ? err.fieldMessage : "Could not save your changes.");
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    save.mutate(fullName);
  }

  return (
    <div className="flex max-w-md flex-col gap-6">
      <h1 className="text-title font-bold">Account</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-full-name">Full name</Label>
          <Input
            id="settings-full-name"
            required
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              setSaved(false);
            }}
          />
        </div>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {saved && <p className="text-caption text-status-approved-fg">Saved</p>}

        <Button type="submit" disabled={save.isPending} className="self-start">
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </form>

      <dl className="flex flex-col gap-3 rounded-panel bg-surface p-4">
        <div className="flex justify-between gap-4">
          <dt className="text-caption text-text-muted">Email</dt>
          <dd className="text-ui">{user.email}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-caption text-text-muted">Role</dt>
          <dd className="text-ui">{ROLE_LABELS[user.role]}</dd>
        </div>
      </dl>
      <p className="text-caption text-text-tertiary">
        Your role and program/branch are set by an administrator and cannot be changed here.
      </p>
    </div>
  );
}
