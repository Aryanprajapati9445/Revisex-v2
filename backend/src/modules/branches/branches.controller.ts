import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { buildPaginationMeta, parsePagination } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import * as branchesService from "./branches.service.js";

// program_id is required: an unscoped branch list has no product meaning and
// would let a client page the whole table.
const listQuerySchema = z.object({ program_id: z.string().uuid() });

export async function listBranches(req: Request, res: Response, next: NextFunction) {
  try {
    const { program_id } = listQuerySchema.parse(req.query);
    const { page, limit, offset } = parsePagination(req.query);
    const { rows, total } = await branchesService.listActiveBranches(program_id, limit, offset);
    sendSuccess(res, { items: rows, pagination: buildPaginationMeta(page, limit, total) });
  } catch (err) {
    next(err);
  }
}
