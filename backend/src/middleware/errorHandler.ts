import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Express identifies error-handling middleware by arity (4 params) — _req and
// _next must stay even though this function doesn't use them.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : "Internal server error";

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    error: message,
    ...(env.NODE_ENV === "development" && err instanceof Error ? { stack: err.stack } : {}),
  });
}
