import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { buildPaginationMeta, parsePagination } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import * as subjectsService from "./subjects.service.js";

const listQuerySchema = z.object({
  branch_id: z.string().uuid(),
  // Upper bound is per-program and enforced by a DB trigger; the client only
  // needs the floor so a nonsense value fails as 422 rather than an empty page.
  semester: z.coerce.number().int().min(1).max(20).optional(),
});

export async function listSubjects(req: Request, res: Response, next: NextFunction) {
  try {
    const { branch_id, semester } = listQuerySchema.parse(req.query);
    const { page, limit, offset } = parsePagination(req.query);
    const { rows, total } = await subjectsService.listActiveSubjects(
      { branchId: branch_id, semester },
      limit,
      offset
    );
    sendSuccess(res, { items: rows, pagination: buildPaginationMeta(page, limit, total) });
  } catch (err) {
    next(err);
  }
}
