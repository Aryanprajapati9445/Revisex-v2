import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/useAuth";

export function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await forgotPassword(email);
    } finally {
      setPending(false);
      // Always show the same message, whether or not the account exists —
      // the backend already never reveals which (see auth.service.ts).
      setSubmitted(true);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-12">
      <h1 className="text-title font-bold">Forgot password</h1>
      {submitted ? (
        <p className="text-ui text-text-muted">If an account exists for that email, we sent a reset link.</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="forgot-email">Email</Label>
            <Input
              id="forgot-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <p className="text-ui text-text-muted">
        <Link to="/login" className="underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
