import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError.js";
import { buildPaginationMeta, parsePagination } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import * as programsService from "./programs.service.js";

const idParamSchema = z.string().uuid();

export async function listPrograms(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const { rows, total } = await programsService.listActivePrograms(limit, offset);
    sendSuccess(res, { items: rows, pagination: buildPaginationMeta(page, limit, total) });
  } catch (err) {
    next(err);
  }
}

export async function getProgram(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedId = idParamSchema.safeParse(req.params.id);
    if (!parsedId.success) throw new ApiError(400, "VALIDATION_ERROR", "Program id must be a UUID");
    const id = parsedId.data;

    const data = await programsService.getProgramById(id);
    if (!data) throw new ApiError(404, "NOT_FOUND", `Program ${id} not found`);

    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}
