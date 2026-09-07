import type { Request, Response } from "express";
import { getRequestId } from "../lib/requestContext.js";

export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}`, requestId: getRequestId() },
  });
}
