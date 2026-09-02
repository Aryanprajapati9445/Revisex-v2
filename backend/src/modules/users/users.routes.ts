import { Router } from "express";

// Stub — not implemented yet. Wire up users.controller.ts / users.service.ts
// following the pattern in modules/programs/ once the design for this
// resource (validation, auth/scope rules) is settled.
export const usersRouter = Router();

usersRouter.use((_req, res) => {
  res.status(501).json({ error: "users endpoints not implemented yet" });
});
