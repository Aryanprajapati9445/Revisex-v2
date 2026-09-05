import { AlertCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/features/auth/useAuth";

export function VerifyEmailPage() {
  const { verifyEmail, resendOtp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await verifyEmail(email, code);
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleResend() {
    setError(null);
    try {
      await resendOtp(email);
      setResendCooldown(60);
      const interval = setInterval(() => {
        setResendCooldown((s) => {
          if (s <= 1) {
            clearInterval(interval);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-12">
      <h1 className="text-title font-bold">Verify your email</h1>
      <p className="text-ui text-text-muted">We sent a 6-digit code to {email}.</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="verify-code">Verification code</Label>
          <Input
            id="verify-code"
            required
            maxLength={6}
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Verifying…" : "Verify"}
        </Button>
      </form>
      <Button type="button" variant="ghost" disabled={resendCooldown > 0} onClick={handleResend}>
        {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
      </Button>
    </div>
  );
}
