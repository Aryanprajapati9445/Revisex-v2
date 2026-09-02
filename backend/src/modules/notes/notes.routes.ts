import { Router } from "express";

// Stub — not implemented yet. Wire up notes.controller.ts / notes.service.ts
// following the pattern in modules/programs/ once the design for this
// resource (validation, auth/scope rules) is settled.
export const notesRouter = Router();

notesRouter.use((_req, res) => {
  res.status(501).json({ error: "notes endpoints not implemented yet" });
});
