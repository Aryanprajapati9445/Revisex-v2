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
