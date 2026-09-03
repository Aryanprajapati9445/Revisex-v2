import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "./useAuth";

export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(email, password);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-caption text-text-muted">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-control bg-surface px-2.5 py-1.5 text-ui outline-none"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-caption text-text-muted">Password</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-control bg-surface px-2.5 py-1.5 text-ui outline-none"
        />
      </label>

      {error && (
        <p role="alert" className="text-caption text-status-rejected-fg">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-accent px-4 py-2 text-ui font-medium text-white transition-colors duration-150 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
