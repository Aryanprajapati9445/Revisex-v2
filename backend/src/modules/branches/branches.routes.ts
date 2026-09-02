import { Router } from "express";
import { ApiError } from "../../lib/apiError.js";

// Stub — not implemented yet. Wire up branches.controller.ts / branches.service.ts
// following the pattern in modules/programs/ once the design for this
// resource (validation, auth/scope rules) is settled.
export const branchesRouter = Router();

branchesRouter.use((_req, _res, next) => {
  next(new ApiError(501, "NOT_IMPLEMENTED", "branches endpoints not implemented yet"));
});
