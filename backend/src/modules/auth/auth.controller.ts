import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { ApiError } from "../../lib/apiError.js";
import { sendSuccess } from "../../lib/response.js";
import * as authService from "./auth.service.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  full_name: z.string().min(1).max(150),
  branch_id: z.string().uuid(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

const resendOtpSchema = z.object({
  email: z.string().email(),
});

const forgotPasswordSchema = z.object({ email: z.string().email() });
const resetPasswordSchema = z.object({ token: z.string().min(1), password: z.string().min(8).max(72) });
const googleCompleteSchema = z.object({
  pendingToken: z.string().min(1),
  branch_id: z.string().uuid(),
});

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const input = registerSchema.parse(req.body);
    const { user, needsVerification } = await authService.registerStudent(input);
    sendSuccess(res, { user, needsVerification }, 201);
  } catch (err) {
    next(err);
  }
}

export async function verifyEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, code } = verifyEmailSchema.parse(req.body);
    const { user, tokens } = await authService.verifyEmail(email, code);
    sendSuccess(res, { user, ...tokens });
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    await authService.forgotPassword(email);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(token, password);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}

export async function resendOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = resendOtpSchema.parse(req.body);
    await authService.resendOtp(email);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}

export function googleRedirect(_req: Request, res: Response) {
  res.redirect(authService.googleAuthUrl());
}

export async function googleCallback(req: Request, res: Response) {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  try {
    const result = await authService.handleGoogleCallback(code, state);
    if (result.kind === "session") {
      res.redirect(
        `${env.APP_URL}/oauth/callback#accessToken=${result.tokens.accessToken}&refreshToken=${result.tokens.refreshToken}`
      );
    } else {
      res.redirect(`${env.APP_URL}/oauth/complete#pending=${result.pendingToken}`);
    }
  } catch {
    // Never leak provider/error details to the browser — a generic bounce
    // back to login with a flag the frontend turns into a toast.
    res.redirect(`${env.APP_URL}/login?error=oauth_failed`);
  }
}

export async function googleComplete(req: Request, res: Response, next: NextFunction) {
  try {
    const { pendingToken, branch_id } = googleCompleteSchema.parse(req.body);
    const { user, tokens } = await authService.completeGoogleSignup(pendingToken, branch_id);
    sendSuccess(res, { user, ...tokens }, 201);
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const { user, tokens } = await authService.login(email, password);
    sendSuccess(res, { user, ...tokens });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const tokens = await authService.refresh(refreshToken);
    sendSuccess(res, tokens);
  } catch (err) {
    next(err);
  }
}

export async function logout(_req: Request, res: Response) {
  // Stateless refresh tokens cannot be revoked server-side — logout is a
  // client-side token discard. This endpoint exists for API completeness.
  sendSuccess(res, null);
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const user = await authService.getUserById(req.user.id);
    if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}
