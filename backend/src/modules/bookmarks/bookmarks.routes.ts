import { Router } from "express";
import { ApiError } from "../../lib/apiError.js";

// Stub — not implemented yet. Wire up bookmarks.controller.ts / bookmarks.service.ts
// following the pattern in modules/programs/ once the design for this
// resource (validation, auth/scope rules) is settled.
export const bookmarksRouter = Router();

bookmarksRouter.use((_req, _res, next) => {
  next(new ApiError(501, "NOT_IMPLEMENTED", "bookmarks endpoints not implemented yet"));
});
