import { AlertCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useBranches, usePrograms } from "@/features/taxonomy/queries";
import { ApiError } from "@/lib/api-client";
import { PICKER_LIMIT } from "@/lib/query-keys";
import { useAuth } from "./useAuth";

export function RegisterForm({ onSuccess }: { onSuccess?: () => void }) {
  const { register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [programId, setProgramId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const programs = usePrograms(1, PICKER_LIMIT);
  const branches = useBranches(programId, 1, PICKER_LIMIT);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setPending(true);
    try {
      await register({ email, password, full_name: fullName, branch_id: branchId });
      onSuccess?.();
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_TAKEN") {
        // 409 from the users_email_key unique constraint — belongs on the
        // field the user has to change, not in a banner.
        setFieldErrors({ email: err.message });
      } else if (err instanceof ApiError && err.fieldName) {
        setFieldErrors({ [err.fieldName]: err.fieldMessage });
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setPending(false);
    }
  }

  // Native <select>, not the shadcn Select: kept for plain, testable
  // keyboard/selectOptions interaction — no listbox behavior is needed here.
  const selectClass =
    "rounded-control bg-surface px-2.5 py-1.5 text-ui outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="register-full-name">Full name</Label>
        <Input id="register-full-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        {fieldErrors.full_name && <span className="text-caption text-status-rejected-fg">{fieldErrors.full_name}</span>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="register-email">Email</Label>
        <Input id="register-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {fieldErrors.email && <span className="text-caption text-status-rejected-fg">{fieldErrors.email}</span>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="register-password">Password</Label>
        <PasswordInput
          id="register-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {fieldErrors.password && <span className="text-caption text-status-rejected-fg">{fieldErrors.password}</span>}
      </div>

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
        <select
          required
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          disabled={!programId}
          className={selectClass}
        >
          <option value="">{programId ? "Select a branch" : "Pick a program first"}</option>
          {branches.data?.items.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        {fieldErrors.branch_id && <span className="text-caption text-status-rejected-fg">{fieldErrors.branch_id}</span>}
      </label>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
