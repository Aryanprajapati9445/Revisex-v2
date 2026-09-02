import { Router } from "express";
import { ApiError } from "../../lib/apiError.js";

// Stub — not implemented yet. Wire up subjects.controller.ts / subjects.service.ts
// following the pattern in modules/programs/ once the design for this
// resource (validation, auth/scope rules) is settled.
export const subjectsRouter = Router();

subjectsRouter.use((_req, _res, next) => {
  next(new ApiError(501, "NOT_IMPLEMENTED", "subjects endpoints not implemented yet"));
});
