import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError.js";
import { withAudit } from "../../lib/audit.js";
import { buildPaginationMeta, parsePagination } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import { assertIsManager, resolveActorScope } from "../../lib/taxonomyAccess.js";
import * as programsService from "./programs.service.js";

const idParamSchema = z.string().uuid();

// Codes are stored upper-case (the programs_code_upper CHECK), so the API
// upper-cases rather than rejecting a lower-case submission — the form should
// not make a human do the database's formatting.
const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9._-]+$/, "code may only contain letters, digits, dot, dash or underscore")
  .transform((value) => value.toUpperCase());

const boolFlag = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((value) => value === "true" || value === "1");

const listQuerySchema = z.object({
  include_inactive: boolFlag,
  with_counts: boolFlag,
  q: z.string().trim().min(1).max(120).optional(),
});

export async function listPrograms(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listQuerySchema.parse(req.query);
    const { page, limit, offset } = parsePagination(req.query);

    // The plain public listing stays exactly as it was; only the count/inactive
    // view is gated, so an anonymous browse still costs one cheap query.
    if (!query.with_counts && !query.include_inactive) {
      const { rows, total } = await programsService.listActivePrograms(limit, offset);
      sendSuccess(res, { items: rows, pagination: buildPaginationMeta(page, limit, total) });
      return;
    }

    const actor = assertIsManager(req.user);
    const scope = await resolveActorScope(actor);
    const { rows, total } = await programsService.listProgramsWithCounts(
      {
        includeInactive: query.include_inactive,
        q: query.q,
        programScopeId: scope.programId ?? undefined,
      },
      limit,
      offset
    );
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

    // A manager can resolve a deactivated program (they need to edit or restore
    // it); everyone else gets the same 404 browse would give.
    const isManager = req.user !== undefined && ["superuser", "program_admin", "branch_admin"].includes(req.user.role);
    const data = isManager
      ? await programsService.getProgramByIdIncludingInactive(id)
      : await programsService.getProgramById(id);
    if (!data) throw new ApiError(404, "NOT_FOUND", `Program ${id} not found`);

    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

const createSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1).max(120),
  duration_semesters: z.coerce.number().int().min(1).max(20),
});

export async function createProgram(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const input = createSchema.parse(req.body);
    const program = await withAudit(
      {
        actorUserId: req.user.id,
        action: "program.create",
        resource: "program",
        resourceId: null,
        metadata: { code: input.code },
      },
      () => programsService.createProgram(input)
    );
    sendSuccess(res, program, 201);
  } catch (err) {
    next(err);
  }
}

const updateSchema = z
  .object({
    code: codeSchema.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    duration_semesters: z.coerce.number().int().min(1).max(20).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

export async function updateProgram(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const parsedId = idParamSchema.safeParse(req.params.id);
    if (!parsedId.success) throw new ApiError(400, "VALIDATION_ERROR", "Program id must be a UUID");

    const input = updateSchema.parse(req.body);
    const existing = await programsService.getProgramByIdIncludingInactive(parsedId.data);
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Program not found");

    const updated = await withAudit(
      {
        actorUserId: req.user.id,
        action: "program.update",
        resource: "program",
        resourceId: parsedId.data,
        metadata: { fields: Object.keys(input) },
      },
      () => programsService.updateProgram(parsedId.data, input)
    );
    if (!updated) throw new ApiError(404, "NOT_FOUND", "Program not found");
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}

/**
 * Soft delete. The row is never removed — notes uploaded under it must survive,
 * and the FKs are ON DELETE RESTRICT anyway — so this deactivates the program
 * and everything under it. See deactivateProgramCascade.
 */
export async function deactivateProgram(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const parsedId = idParamSchema.safeParse(req.params.id);
    if (!parsedId.success) throw new ApiError(400, "VALIDATION_ERROR", "Program id must be a UUID");

    const existing = await programsService.getProgramByIdIncludingInactive(parsedId.data);
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Program not found");

    const impact = await withAudit(
      {
        actorUserId: req.user.id,
        action: "program.deactivate",
        resource: "program",
        resourceId: parsedId.data,
        metadata: { code: existing.code },
      },
      () => programsService.deactivateProgramCascade(parsedId.data)
    );
    sendSuccess(res, impact);
  } catch (err) {
    next(err);
  }
}
