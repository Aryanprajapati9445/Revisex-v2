import { Router } from "express";

// Stub — not implemented yet. Wire up ratings.controller.ts / ratings.service.ts
// following the pattern in modules/programs/ once the design for this
// resource (validation, auth/scope rules) is settled.
export const ratingsRouter = Router();

ratingsRouter.use((_req, res) => {
  res.status(501).json({ error: "ratings endpoints not implemented yet" });
});
