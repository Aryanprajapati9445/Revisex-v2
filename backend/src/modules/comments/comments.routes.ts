import { Router } from "express";

// Stub — not implemented yet. Wire up comments.controller.ts / comments.service.ts
// following the pattern in modules/programs/ once the design for this
// resource (validation, auth/scope rules) is settled.
export const commentsRouter = Router();

commentsRouter.use((_req, res) => {
  res.status(501).json({ error: "comments endpoints not implemented yet" });
});
