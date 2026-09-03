import { Link, Navigate, useNavigate } from "react-router-dom";
import { RegisterForm } from "@/features/auth/RegisterForm";
import { useAuth } from "@/features/auth/useAuth";

export function RegisterPage() {
  const { status } = useAuth();
  const navigate = useNavigate();

  if (status === "authenticated") return <Navigate to="/" replace />;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-12">
      <h1 className="text-title font-bold">Create an account</h1>
      <RegisterForm onSuccess={() => navigate("/", { replace: true })} />
      <p className="text-ui text-text-muted">
        Already have one?{" "}
        <Link to="/login" className="underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
