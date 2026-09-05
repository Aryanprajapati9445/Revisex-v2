import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { LoginForm } from "@/features/auth/LoginForm";
import { useAuth } from "@/features/auth/useAuth";

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
