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
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  // Held in a ref, not state: the refresh handler must read the current value
  // without re-registering itself on every render.
  const refreshTokenRef = useRef<string | null>(readStoredRefreshToken());

  const applySession = useCallback((payload: AuthPayload) => {
    setAccessToken(payload.accessToken);
    refreshTokenRef.current = payload.refreshToken;
    writeStoredRefreshToken(payload.refreshToken);
    setUser(payload.user);
    setStatus("authenticated");
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    refreshTokenRef.current = null;
    writeStoredRefreshToken(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

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
      const token = refreshTokenRef.current;
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

  const register = useCallback(
    async (input: RegisterInput) => {
      applySession(await api.post<AuthPayload>("/api/auth/register", input));
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
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
