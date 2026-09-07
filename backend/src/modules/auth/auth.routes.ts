import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { ipRateLimit, loginThrottleCheck } from "../../middleware/rateLimit.js";
import {
  forgotPassword,
  googleCallback,
  googleComplete,
  googleRedirect,
  login,
  logout,
  me,
  refresh,
  register,
  resendOtp,
  resetPassword,
  verifyEmail,
} from "./auth.controller.js";

export const authRouter = Router();

// Per-account-attempt limiting already lives in auth.service.ts (OTP resend
// cooldown, OTP attempt lockout, login's exponential backoff below); these
// per-IP limits are the outer layer of defense against a single client
// hammering any of these endpoints regardless of which account it targets.
const authIpLimit = ipRateLimit({ windowMs: 15 * 60_000, max: 20, prefix: "auth" });
const strictIpLimit = ipRateLimit({ windowMs: 60 * 60_000, max: 10, prefix: "auth-strict" });

authRouter.post("/register", strictIpLimit, register);
authRouter.post("/verify-email", authIpLimit, verifyEmail);
authRouter.post("/resend-otp", strictIpLimit, resendOtp);
authRouter.post("/login", authIpLimit, loginThrottleCheck, login);
authRouter.post("/forgot-password", strictIpLimit, forgotPassword);
authRouter.post("/reset-password", authIpLimit, resetPassword);
authRouter.get("/google", googleRedirect);
authRouter.get("/google/callback", googleCallback);
authRouter.post("/google/complete", authIpLimit, googleComplete);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);
