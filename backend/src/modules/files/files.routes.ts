import { Router } from "express";

// Stub — not implemented yet. Wire up files.controller.ts / files.service.ts
// following the pattern in modules/programs/ once the design for this
// resource (validation, auth/scope rules) is settled.
export const filesRouter = Router();

filesRouter.use((_req, res) => {
  res.status(501).json({ error: "files endpoints not implemented yet" });
});
