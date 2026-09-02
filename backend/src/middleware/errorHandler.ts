import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { ApiError } from "../lib/apiError.js";
import { isInvalidTextRepresentation } from "../lib/pgError.js";

// Express identifies error-handling middleware by arity (4 params) — _req and
// _next must stay even though this function doesn't use them.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof ZodError) {
    const first = err.issues[0];
    res.status(422).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: first ? `${first.path.join(".")}: ${first.message}` : "Validation failed",
      },
    });
    return;
  }

  if (isInvalidTextRepresentation(err)) {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "One or more identifiers are malformed" },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: env.NODE_ENV === "development" && err instanceof Error ? err.message : "Internal server error",
    },
  });
}
