import { Router } from "express";

// Stub — not implemented yet. Wire up subjects.controller.ts / subjects.service.ts
// following the pattern in modules/programs/ once the design for this
// resource (validation, auth/scope rules) is settled.
export const subjectsRouter = Router();

subjectsRouter.use((_req, res) => {
  res.status(501).json({ error: "subjects endpoints not implemented yet" });
});
