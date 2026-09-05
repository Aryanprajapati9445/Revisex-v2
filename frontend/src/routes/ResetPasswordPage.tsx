import { AlertCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/features/auth/useAuth";

export function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await resetPassword(token, password);
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-12">
      <h1 className="text-title font-bold">Reset password</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reset-password">New password</Label>
          <PasswordInput
            id="reset-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Resetting…" : "Reset password"}
        </Button>
      </form>
    </div>
  );
}
