import { Router } from "express";

// Stub — not implemented yet. Wire up tags.controller.ts / tags.service.ts
// following the pattern in modules/programs/ once the design for this
// resource (validation, auth/scope rules) is settled.
export const tagsRouter = Router();

tagsRouter.use((_req, res) => {
  res.status(501).json({ error: "tags endpoints not implemented yet" });
});
