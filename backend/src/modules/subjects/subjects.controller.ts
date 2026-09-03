import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError.js";
import { buildPaginationMeta, parsePagination } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import * as subjectsService from "./subjects.service.js";

const idParamSchema = z.string().uuid();

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

// Lets a deep link to /subjects/:id name the subject. The list endpoint is
// branch-scoped, so without this a client holding only a subject id — which is
// exactly what the note-list route carries — cannot resolve it.
export async function getSubject(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedId = idParamSchema.safeParse(req.params.id);
    if (!parsedId.success) throw new ApiError(400, "VALIDATION_ERROR", "Subject id must be a UUID");

    const data = await subjectsService.getSubjectById(parsedId.data);
    if (!data) throw new ApiError(404, "NOT_FOUND", `Subject ${parsedId.data} not found`);

    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}
