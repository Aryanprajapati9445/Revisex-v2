import { Link, Navigate, useNavigate } from "react-router-dom";
import { RegisterForm } from "@/features/auth/RegisterForm";
import { useAuth } from "@/features/auth/useAuth";
import { BASE_URL } from "@/lib/api-client";

export function RegisterPage() {
  const { status } = useAuth();
  const navigate = useNavigate();

  if (status === "authenticated") return <Navigate to="/home" replace />;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-12">
      <h1 className="text-title font-bold">Create an account</h1>
      <RegisterForm onRegistered={(email) => navigate(`/verify-email?email=${encodeURIComponent(email)}`)} />
      <a
        href={`${BASE_URL}/api/auth/google`}
        className="rounded-control bg-surface px-3 py-2 text-center text-ui outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Continue with Google
      </a>
      <p className="text-ui text-text-muted">
        Already have one?{" "}
        <Link to="/login" className="underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
