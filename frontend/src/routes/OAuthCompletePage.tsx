import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useBranches, usePrograms } from "@/features/taxonomy/queries";
import { useAuth } from "@/features/auth/useAuth";
import { PICKER_LIMIT } from "@/lib/query-keys";

export function OAuthCompletePage() {
  const { completeOAuthProfile } = useAuth();
  const navigate = useNavigate();
  const [programId, setProgramId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const programs = usePrograms(1, PICKER_LIMIT);
  const branches = useBranches(programId, 1, PICKER_LIMIT);

  const pendingToken = new URLSearchParams(window.location.hash.slice(1)).get("pending") ?? "";

  const selectClass =
    "rounded-control bg-surface px-2.5 py-1.5 text-ui outline-none focus-visible:ring-2 focus-visible:ring-ring";

  async function handleSubmit() {
    setError(null);
    setPending(true);
    try {
      await completeOAuthProfile(pendingToken, branchId);
      window.history.replaceState(null, "", window.location.pathname);
      navigate("/home", { replace: true });
    } catch {
      setError("Something went wrong finishing sign-up. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-12">
      <h1 className="text-title font-bold">One more step</h1>
      <p className="text-ui text-text-muted">Tell us your branch to finish creating your account.</p>

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
      </label>

      {error && <p className="text-caption text-status-rejected-fg">{error}</p>}

      <Button type="button" disabled={pending || !branchId} onClick={handleSubmit}>
        {pending ? "Finishing…" : "Finish sign up"}
      </Button>
    </div>
  );
}
