import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../lib/logger.js";
import { ApiError } from "../lib/apiError.js";
import { isInvalidTextRepresentation } from "../lib/pgError.js";
import { getRequestId } from "../lib/requestContext.js";

function send(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message, requestId: getRequestId() } });
}

// Express identifies error-handling middleware by arity (4 params) — _req and
// _next must stay even though this function doesn't use them.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    // ApiError messages are always hand-written to be safe to show a user
    // (see externalError.ts for the one place raw provider errors get
    // converted into one of these) — never anything from a caught exception
    // verbatim.
    send(res, err.status, err.code, err.message);
    return;
  }

  if (err instanceof ZodError) {
    const first = err.issues[0];
    send(res, 422, "VALIDATION_ERROR", first ? `${first.path.join(".")}: ${first.message}` : "Validation failed");
    return;
  }

  if (isInvalidTextRepresentation(err)) {
    send(res, 400, "VALIDATION_ERROR", "One or more identifiers are malformed");
    return;
  }

  // Anything else is an error we didn't anticipate — a raw driver/network
  // exception, a programmer error, etc. Its message can contain anything
  // (connection strings, stack frames, provider text), so it must never be
  // forwarded to the client, in any environment: a "helpful" dev-mode leak
  // is exactly how internal details end up in a browser console. The full
  // detail goes to the server log only, tagged with the request ID that's
  // also in the client-facing response, so a report of "requestId X failed"
  // can be traced back to this log line without ever showing X's contents
  // to the user.
  logger.error("unhandled_request_error", { cause: err });
  send(res, 500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
}
