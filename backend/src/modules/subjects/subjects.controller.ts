import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError.js";
import { withAudit } from "../../lib/audit.js";
import { buildPaginationMeta, parsePagination } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import {
  assertCanCreate,
  assertInScope,
  assertIsManager,
  isInScope,
  resolveActorScope,
  resolveBranchScope,
  resolveSubjectScope,
} from "../../lib/taxonomyAccess.js";
import * as subjectsService from "./subjects.service.js";

const idParamSchema = z.string().uuid();

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
  branch_id: z.string().uuid().optional(),
  program_id: z.string().uuid().optional(),
  // Upper bound is per-program and enforced by a DB trigger; the client only
  // needs the floor so a nonsense value fails as 422 rather than an empty page.
  semester: z.coerce.number().int().min(1).max(20).optional(),
  include_inactive: boolFlag,
  with_counts: boolFlag,
  q: z.string().trim().min(1).max(120).optional(),
});

export async function listSubjects(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listQuerySchema.parse(req.query);
    const { page, limit, offset } = parsePagination(req.query);

    if (!query.with_counts && !query.include_inactive) {
      if (!query.branch_id) {
        throw new ApiError(422, "VALIDATION_ERROR", "branch_id: Required");
      }
      const { rows, total } = await subjectsService.listActiveSubjects(
        { branchId: query.branch_id, semester: query.semester },
        limit,
        offset
      );
      sendSuccess(res, { items: rows, pagination: buildPaginationMeta(page, limit, total) });
      return;
    }

    const actor = assertIsManager(req.user);
    const scope = await resolveActorScope(actor);
    const { rows, total } = await subjectsService.listSubjectsWithCounts(
      {
        // The actor's own scope always wins over a requested filter, so a
        // hand-edited id cannot widen the result past what their role allows.
        branchId: scope.branchId ?? query.branch_id,
        programId: scope.programId ?? query.program_id,
        semester: query.semester,
        includeInactive: query.include_inactive,
        q: query.q,
      },
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

    const isManager = req.user !== undefined && ["superuser", "program_admin", "branch_admin"].includes(req.user.role);
    const data = isManager
      ? await subjectsService.getSubjectByIdIncludingInactive(parsedId.data)
      : await subjectsService.getSubjectById(parsedId.data);
    if (!data) throw new ApiError(404, "NOT_FOUND", `Subject ${parsedId.data} not found`);

    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

const createSchema = z.object({
  branch_id: z.string().uuid(),
  code: codeSchema,
  name: z.string().trim().min(1).max(150),
  semester: z.coerce.number().int().min(1).max(20),
});

export async function createSubject(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    assertCanCreate(req.user, "subject");
    const input = createSchema.parse(req.body);

    const parentScope = await resolveBranchScope(input.branch_id);
    if (!parentScope) throw new ApiError(422, "VALIDATION_ERROR", "branch_id does not reference an existing branch");
    if (!isInScope(req.user, parentScope)) {
      throw new ApiError(403, "FORBIDDEN", "That branch is outside your scope");
    }

    const subject = await withAudit(
      {
        actorUserId: req.user.id,
        action: "subject.create",
        resource: "subject",
        resourceId: null,
        metadata: { code: input.code, branch_id: input.branch_id, semester: input.semester },
      },
      () => subjectsService.createSubject(input)
    );
    sendSuccess(res, subject, 201);
  } catch (err) {
    next(err);
  }
}

const updateSchema = z
  .object({
    code: codeSchema.optional(),
    name: z.string().trim().min(1).max(150).optional(),
    semester: z.coerce.number().int().min(1).max(20).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

export async function updateSubject(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const parsedId = idParamSchema.safeParse(req.params.id);
    if (!parsedId.success) throw new ApiError(400, "VALIDATION_ERROR", "Subject id must be a UUID");

    const input = updateSchema.parse(req.body);
    assertInScope(req.user, await resolveSubjectScope(parsedId.data), "Subject");

    const updated = await withAudit(
      {
        actorUserId: req.user.id,
        action: "subject.update",
        resource: "subject",
        resourceId: parsedId.data,
        metadata: { fields: Object.keys(input) },
      },
      () => subjectsService.updateSubject(parsedId.data, input)
    );
    if (!updated) throw new ApiError(404, "NOT_FOUND", "Subject not found");
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}

/** Soft delete — the subject's notes keep existing, they just leave browse. */
export async function deactivateSubject(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const parsedId = idParamSchema.safeParse(req.params.id);
    if (!parsedId.success) throw new ApiError(400, "VALIDATION_ERROR", "Subject id must be a UUID");

    assertInScope(req.user, await resolveSubjectScope(parsedId.data), "Subject");

    const notes = await withAudit(
      {
        actorUserId: req.user.id,
        action: "subject.deactivate",
        resource: "subject",
        resourceId: parsedId.data,
        metadata: null,
      },
      () => subjectsService.deactivateSubject(parsedId.data)
    );
    sendSuccess(res, { notes });
  } catch (err) {
    next(err);
  }
}
