import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { LoginForm } from "@/features/auth/LoginForm";
import { useAuth } from "@/features/auth/useAuth";
import { BASE_URL } from "@/lib/api-client";

export function LoginPage() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/home";

  if (status === "authenticated") return <Navigate to={from} replace />;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-12">
      <h1 className="text-title font-bold">Log in</h1>
      <LoginForm onSuccess={() => navigate(from, { replace: true })} />
      <a
        href={`${BASE_URL}/api/auth/google`}
        className="rounded-control bg-surface px-3 py-2 text-center text-ui outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Continue with Google
      </a>
      <p className="text-ui text-text-muted">
        No account?{" "}
        <Link to="/register" className="underline">
          Create one
        </Link>
      </p>
      <p className="text-ui text-text-muted">
        <Link to="/forgot-password" className="underline">
          Forgot password?
        </Link>
      </p>
    </div>
  );
}
