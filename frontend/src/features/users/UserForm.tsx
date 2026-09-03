import { useState, type FormEvent } from "react";
import { useAuth } from "@/features/auth/useAuth";
import type { UserRole } from "@/lib/api-types";
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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      full_name: fullName,
      email,
      password,
      role,
      // Students and branch_admins are branch-scoped; the caller's own branch
      // is the only one they may target.
      branch_id: role === "program_admin" ? null : (user?.branch_id ?? null),
      program_id: role === "program_admin" ? (user?.program_id ?? null) : null,
    });
  }

  const inputClass = "rounded-control bg-surface px-2.5 py-1.5 text-ui outline-none";

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
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={inputClass}>
              {allowedRoles.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABELS[option]}
                </option>
              ))}
            </select>
          </label>

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
              disabled={pending}
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
