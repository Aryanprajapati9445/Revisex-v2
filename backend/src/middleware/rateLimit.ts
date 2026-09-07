import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/apiError.js";

// In-memory — fine for a single-instance deployment. A multi-instance
// deployment needs a shared store (e.g. Redis) instead, since each
// instance would otherwise track its own independent counters.
interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

function keyOf(req: Request, prefix: string): string {
  return `${prefix}:${req.ip}`;
}

/**
 * Fixed-window per-IP limiter for endpoints that don't warrant per-account
 * exponential backoff (registration, password-reset requests, OTP resends)
 * but still shouldn't be hammerable — this is defense in depth on top of
 * those endpoints' existing per-account cooldowns.
 */
export function ipRateLimit(opts: { windowMs: number; max: number; prefix: string }) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = keyOf(req, opts.prefix);
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }

    if (bucket.count >= opts.max) {
      next(new ApiError(429, "RATE_LIMITED", "Too many requests. Please wait before trying again."));
      return;
    }

    bucket.count += 1;
    next();
  };
}

// --- Exponential backoff on repeated login failures, keyed by IP+email ---
//
// A flat rate limit alone still lets an attacker grind through a password
// list at a steady sub-threshold rate. Doubling the lockout on each
// consecutive failure (capped) makes sustained guessing increasingly
// expensive without needing to block the account outright or reveal
// whether the email exists — the lockout applies identically whether the
// email is real or not, since login() already returns the same response
// either way (see verifyPasswordTimingSafe in password.ts).
interface LoginAttemptState {
  failures: number;
  lockedUntil: number;
}
const loginAttempts = new Map<string, LoginAttemptState>();

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 15 * 60_000;
const BACKOFF_AFTER = 3; // first few failures are free — normal typos happen

function loginKey(req: Request): string {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  return `${req.ip}:${email}`;
}

export function loginThrottleCheck(req: Request, _res: Response, next: NextFunction): void {
  const state = loginAttempts.get(loginKey(req));
  if (state && state.lockedUntil > Date.now()) {
    next(new ApiError(429, "RATE_LIMITED", "Too many failed attempts. Please wait before trying again."));
    return;
  }
  next();
}

export function loginThrottleRecordFailure(req: Request): void {
  const key = loginKey(req);
  const state = loginAttempts.get(key) ?? { failures: 0, lockedUntil: 0 };
  state.failures += 1;
  if (state.failures > BACKOFF_AFTER) {
    const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (state.failures - BACKOFF_AFTER), MAX_BACKOFF_MS);
    state.lockedUntil = Date.now() + backoff;
  }
  loginAttempts.set(key, state);
}

export function loginThrottleRecordSuccess(req: Request): void {
  loginAttempts.delete(loginKey(req));
}

/** Test-only: clears all in-memory limiter state between test cases. */
export function __resetRateLimitsForTests(): void {
  buckets.clear();
  loginAttempts.clear();
}
