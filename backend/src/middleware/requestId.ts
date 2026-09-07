import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { runWithRequestContext } from "../lib/requestContext.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

// A correlation ID for every request, so a support ticket or a log line can
// be tied back to a specific failure without ever needing to show the user
// (or a developer reading a bug report) the underlying stack trace.
export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.id = randomUUID();
  res.setHeader("X-Request-Id", req.id);
  runWithRequestContext({ requestId: req.id }, next);
}
