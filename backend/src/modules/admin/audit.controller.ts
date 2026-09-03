import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { buildPaginationMeta, parsePagination } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import * as auditService from "./audit.service.js";

const filterSchema = z.object({
  actor_user_id: z.string().uuid().optional(),
  action: z.string().min(1).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export async function listAuditLog(req: Request, res: Response, next: NextFunction) {
  try {
    const { actor_user_id, action, from, to } = filterSchema.parse(req.query);
    const { page, limit, offset } = parsePagination(req.query);

    const { rows, total } = await auditService.listAuditLog({ actorUserId: actor_user_id, action, from, to }, limit, offset);
    sendSuccess(res, { items: rows, pagination: buildPaginationMeta(page, limit, total) });
  } catch (err) {
    next(err);
  }
}
