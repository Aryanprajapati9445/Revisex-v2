import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
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

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const input = registerSchema.parse(req.body);
    const { user, tokens } = await authService.registerStudent(input);
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
