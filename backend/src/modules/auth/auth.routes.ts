import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
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

authRouter.post("/register", register);
authRouter.post("/verify-email", verifyEmail);
authRouter.post("/resend-otp", resendOtp);
authRouter.post("/login", login);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);
authRouter.get("/google", googleRedirect);
authRouter.get("/google/callback", googleCallback);
authRouter.post("/google/complete", googleComplete);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);
