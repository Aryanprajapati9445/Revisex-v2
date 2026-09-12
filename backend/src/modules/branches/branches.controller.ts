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
} from "../../lib/taxonomyAccess.js";
import * as branchesService from "./branches.service.js";

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

// program_id is required for the public listing: an unscoped branch list has no
// product meaning and would let a client page the whole table. The admin view
// (with_counts) may omit it, because a superuser genuinely wants every branch.
const listQuerySchema = z.object({
  program_id: z.string().uuid().optional(),
  include_inactive: boolFlag,
  with_counts: boolFlag,
  q: z.string().trim().min(1).max(120).optional(),
});

export async function listBranches(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listQuerySchema.parse(req.query);
    const { page, limit, offset } = parsePagination(req.query);

    if (!query.with_counts && !query.include_inactive) {
      if (!query.program_id) {
        throw new ApiError(422, "VALIDATION_ERROR", "program_id: Required");
      }
      const { rows, total } = await branchesService.listActiveBranches(query.program_id, limit, offset);
      sendSuccess(res, { items: rows, pagination: buildPaginationMeta(page, limit, total) });
      return;
    }

    const actor = assertIsManager(req.user);
    const scope = await resolveActorScope(actor);
    const { rows, total } = await branchesService.listBranchesWithCounts(
      {
        // A program_admin's own program always wins over a requested one, so a
        // hand-edited program_id cannot widen the result past their scope.
        programId: scope.programId ?? query.program_id,
        branchScopeId: scope.branchId ?? undefined,
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

// Lets a deep link to /branches/:id name the branch. The list endpoint is
// program-scoped, so without this a client holding only a branch id has no way
// to resolve it.
export async function getBranch(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedId = idParamSchema.safeParse(req.params.id);
    if (!parsedId.success) throw new ApiError(400, "VALIDATION_ERROR", "Branch id must be a UUID");

    const isManager = req.user !== undefined && ["superuser", "program_admin", "branch_admin"].includes(req.user.role);
    const data = isManager
      ? await branchesService.getBranchByIdIncludingInactive(parsedId.data)
      : await branchesService.getBranchById(parsedId.data);
    if (!data) throw new ApiError(404, "NOT_FOUND", `Branch ${parsedId.data} not found`);

    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

const createSchema = z.object({
  program_id: z.string().uuid(),
  code: codeSchema,
  name: z.string().trim().min(1).max(120),
});

export async function createBranch(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    assertCanCreate(req.user, "branch");
    const input = createSchema.parse(req.body);

    // A branch has no branchId of its own yet, so scope is judged on the parent
    // program alone — which is exactly what a program_admin is scoped to.
    if (!isInScope(req.user, { programId: input.program_id, branchId: null })) {
      throw new ApiError(403, "FORBIDDEN", "That program is outside your scope");
    }

    const branch = await withAudit(
      {
        actorUserId: req.user.id,
        action: "branch.create",
        resource: "branch",
        resourceId: null,
        metadata: { code: input.code, program_id: input.program_id },
      },
      () => branchesService.createBranch(input)
    );
    sendSuccess(res, branch, 201);
  } catch (err) {
    next(err);
  }
}

const updateSchema = z
  .object({
    code: codeSchema.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

export async function updateBranch(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const parsedId = idParamSchema.safeParse(req.params.id);
    if (!parsedId.success) throw new ApiError(400, "VALIDATION_ERROR", "Branch id must be a UUID");

    const input = updateSchema.parse(req.body);
    // Without this, `is_active: false` here would be a way around the stricter
    // role gate DELETE /:id carries — a branch_admin renaming their branch is
    // fine, removing the branch they administer is not.
    if (req.user.role === "branch_admin" && input.is_active !== undefined) {
      throw new ApiError(403, "FORBIDDEN", "Only a program administrator can activate or deactivate a branch");
    }
    assertInScope(req.user, await resolveBranchScope(parsedId.data), "Branch");

    const updated = await withAudit(
      {
        actorUserId: req.user.id,
        action: "branch.update",
        resource: "branch",
        resourceId: parsedId.data,
        metadata: { fields: Object.keys(input) },
      },
      () => branchesService.updateBranch(parsedId.data, input)
    );
    if (!updated) throw new ApiError(404, "NOT_FOUND", "Branch not found");
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}

/** Soft delete, cascading to the branch's subjects — see programs.controller. */
export async function deactivateBranch(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const parsedId = idParamSchema.safeParse(req.params.id);
    if (!parsedId.success) throw new ApiError(400, "VALIDATION_ERROR", "Branch id must be a UUID");

    assertInScope(req.user, await resolveBranchScope(parsedId.data), "Branch");

    const impact = await withAudit(
      {
        actorUserId: req.user.id,
        action: "branch.deactivate",
        resource: "branch",
        resourceId: parsedId.data,
        metadata: null,
      },
      () => branchesService.deactivateBranchCascade(parsedId.data)
    );
    sendSuccess(res, impact);
  } catch (err) {
    next(err);
  }
}
