import { Router } from "express";

// Stub — not implemented yet. Wire up bookmarks.controller.ts / bookmarks.service.ts
// following the pattern in modules/programs/ once the design for this
// resource (validation, auth/scope rules) is settled.
export const bookmarksRouter = Router();

bookmarksRouter.use((_req, res) => {
  res.status(501).json({ error: "bookmarks endpoints not implemented yet" });
});
