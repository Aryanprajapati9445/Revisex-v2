import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, setAccessToken, setRefreshHandler } from "@/lib/api-client";
import type { AuthPayload, User } from "@/lib/api-types";
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
  type RegisterInput,
} from "./auth-context";

const REFRESH_TOKEN_KEY = "refreshToken";

function readStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    // Private mode / blocked storage: behave as if signed out.
    return null;
  }
}

function writeStoredRefreshToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token);
    else localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // Non-fatal: the session simply won't survive a reload.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  // Held in a ref, not state: the refresh handler must read the current value
  // without re-registering itself on every render.
  const refreshTokenRef = useRef<string | null>(readStoredRefreshToken());
  // Snapshotted once at mount, never written to again: the boot-restore
  // effect below must act on whatever was in storage when this provider
  // mounted, not on refreshTokenRef.current — a sibling effect (e.g.
  // OAuthCallbackPage's applyOAuthSession, which fires first since child
  // effects commit before this provider's own) can mutate that ref before
  // this effect runs, and re-reading it here would race that write.
  const initialTokenRef = useRef<string | null>(refreshTokenRef.current);

  const applySession = useCallback(
    (payload: AuthPayload) => {
      setAccessToken(payload.accessToken);
      refreshTokenRef.current = payload.refreshToken;
      writeStoredRefreshToken(payload.refreshToken);
      // A new identity must never be served anything cached under the previous
      // one — on a shared machine that is somebody else's data.
      queryClient.clear();
      setUser(payload.user);
      setStatus("authenticated");
    },
    [queryClient]
  );

  const clearSession = useCallback(() => {
    setAccessToken(null);
    refreshTokenRef.current = null;
    writeStoredRefreshToken(null);
    // Signing out has to discard the cache too. It holds scoped, private data
    // — the moderation queue, the user roster and its emails, own uploads —
    // and staleTime would otherwise serve it to the next person on this tab
    // without so much as a refetch.
    queryClient.clear();
    setUser(null);
    setStatus("anonymous");
  }, [queryClient]);

  // Installed into api-client so any 401 triggers exactly one refresh attempt.
  useEffect(() => {
    setRefreshHandler(async () => {
      const token = refreshTokenRef.current;
      if (!token) return false;
      try {
        const tokens = await api.post<{ accessToken: string; refreshToken: string }>(
          "/api/auth/refresh",
          { refreshToken: token },
          // This request must not itself trigger a refresh — see RequestOptions.
          { skipAuthRefresh: true }
        );
        setAccessToken(tokens.accessToken);
        refreshTokenRef.current = tokens.refreshToken;
        writeStoredRefreshToken(tokens.refreshToken);
        return true;
      } catch {
        clearSession();
        return false;
      }
    });
    return () => setRefreshHandler(null);
  }, [clearSession]);

  // Boot: trade a stored refresh token for a live session.
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const token = initialTokenRef.current;
      if (!token) {
        setStatus("anonymous");
        return;
      }
      try {
        const tokens = await api.post<{ accessToken: string; refreshToken: string }>(
          "/api/auth/refresh",
          { refreshToken: token },
          // Boot restore owns its own failure path (fall through to anonymous),
          // so a 401 here should surface immediately rather than round-trip
          // through the refresh handler that would just call this again.
          { skipAuthRefresh: true }
        );
        if (cancelled) return;
        setAccessToken(tokens.accessToken);
        refreshTokenRef.current = tokens.refreshToken;
        writeStoredRefreshToken(tokens.refreshToken);
        const me = await api.get<User>("/api/auth/me");
        if (cancelled) return;
        setUser(me);
        setStatus("authenticated");
      } catch {
        if (!cancelled) clearSession();
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      applySession(await api.post<AuthPayload>("/api/auth/login", { email, password }));
    },
    [applySession]
  );

  const register = useCallback(async (input: RegisterInput) => {
    const result = await api.post<{ user: User; needsVerification: boolean }>("/api/auth/register", input);
    return { needsVerification: result.needsVerification, email: input.email };
  }, []);

  const verifyEmail = useCallback(
    async (email: string, code: string) => {
      applySession(await api.post<AuthPayload>("/api/auth/verify-email", { email, code }));
    },
    [applySession]
  );

  const resendOtp = useCallback(async (email: string) => {
    await api.post("/api/auth/resend-otp", { email });
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    await api.post("/api/auth/forgot-password", { email });
  }, []);

  const resetPassword = useCallback(async (token: string, password: string) => {
    await api.post("/api/auth/reset-password", { token, password });
  }, []);

  const applyOAuthSession = useCallback(
    async (accessToken: string, refreshToken: string) => {
      setAccessToken(accessToken);
      refreshTokenRef.current = refreshToken;
      writeStoredRefreshToken(refreshToken);
      queryClient.clear();
      const me = await api.get<User>("/api/auth/me");
      setUser(me);
      setStatus("authenticated");
    },
    [queryClient]
  );

  const completeOAuthProfile = useCallback(
    async (pendingToken: string, branchId: string) => {
      applySession(await api.post<AuthPayload>("/api/auth/google/complete", { pendingToken, branch_id: branchId }));
    },
    [applySession]
  );

  const logout = useCallback(() => {
    // Refresh tokens are stateless with no server-side revocation, so logout
    // is a local discard. The endpoint is called for API symmetry only.
    void api.post("/api/auth/logout", {}).catch(() => undefined);
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      login,
      register,
      verifyEmail,
      resendOtp,
      forgotPassword,
      resetPassword,
      applyOAuthSession,
      completeOAuthProfile,
      logout,
    }),
    [
      user,
      status,
      login,
      register,
      verifyEmail,
      resendOtp,
      forgotPassword,
      resetPassword,
      applyOAuthSession,
      completeOAuthProfile,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
