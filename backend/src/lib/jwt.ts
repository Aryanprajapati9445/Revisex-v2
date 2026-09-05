import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";
import type { UserRole } from "../types/index.js";

export interface JwtPayload {
  sub: string;
  role: UserRole;
  program_id: string | null;
  branch_id: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL } as SignOptions);
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_TTL } as SignOptions);
}

export function signTokenPair(payload: JwtPayload): TokenPair {
  return { accessToken: signAccessToken(payload), refreshToken: signRefreshToken(payload) };
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
}

export interface OAuthStatePayload {
  purpose: "oauth_state";
}

export interface OAuthPendingPayload {
  purpose: "oauth_pending";
  provider: "google";
  providerUserId: string;
  email: string;
  fullName: string;
}

// Signed with a secret distinct from the session-token secrets above, so a
// state/pending token can never be replayed as (or confused with) an access
// or refresh token even if someone got the claim shapes to overlap.
export function signOAuthState(): string {
  const payload: OAuthStatePayload = { purpose: "oauth_state" };
  return jwt.sign(payload, env.OAUTH_TOKEN_SECRET, { expiresIn: "10m" });
}

export function verifyOAuthState(token: string): OAuthStatePayload {
  const payload = jwt.verify(token, env.OAUTH_TOKEN_SECRET) as OAuthStatePayload;
  if (payload.purpose !== "oauth_state") throw new Error("Invalid token purpose");
  return payload;
}

export function signOAuthPending(payload: Omit<OAuthPendingPayload, "purpose">): string {
  const full: OAuthPendingPayload = { purpose: "oauth_pending", ...payload };
  return jwt.sign(full, env.OAUTH_TOKEN_SECRET, { expiresIn: "15m" });
}

export function verifyOAuthPending(token: string): OAuthPendingPayload {
  const payload = jwt.verify(token, env.OAUTH_TOKEN_SECRET) as OAuthPendingPayload;
  if (payload.purpose !== "oauth_pending") throw new Error("Invalid token purpose");
  return payload;
}
