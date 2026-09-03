import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError.js";
import { buildPaginationMeta, parsePagination } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import * as branchesService from "./branches.service.js";

const idParamSchema = z.string().uuid();

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

// Lets a deep link to /branches/:id name the branch. The list endpoint is
// program-scoped, so without this a client holding only a branch id has no way
// to resolve it.
export async function getBranch(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedId = idParamSchema.safeParse(req.params.id);
    if (!parsedId.success) throw new ApiError(400, "VALIDATION_ERROR", "Branch id must be a UUID");

    const data = await branchesService.getBranchById(parsedId.data);
    if (!data) throw new ApiError(404, "NOT_FOUND", `Branch ${parsedId.data} not found`);

    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}
