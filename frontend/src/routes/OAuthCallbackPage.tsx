import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/useAuth";

export function OAuthCallbackPage() {
  const { applyOAuthSession } = useAuth();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");
    // Strip the fragment immediately so the tokens don't linger in browser
    // history/back-forward cache.
    window.history.replaceState(null, "", window.location.pathname);

    if (!accessToken || !refreshToken) {
      navigate("/login?error=oauth_failed", { replace: true });
      return;
    }

    applyOAuthSession(accessToken, refreshToken)
      .then(() => navigate("/home", { replace: true }))
      .catch(() => navigate("/login?error=oauth_failed", { replace: true }));
  }, [applyOAuthSession, navigate]);

  return <p className="mx-auto max-w-sm py-12 text-center text-ui text-text-muted">Signing you in…</p>;
}
