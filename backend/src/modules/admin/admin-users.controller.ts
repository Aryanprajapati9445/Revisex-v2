import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { withAudit } from "../../lib/audit.js";
import { ApiError } from "../../lib/apiError.js";
import { buildPaginationMeta, parsePagination } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import * as usersService from "../users/users.service.js";

// Reuses users.service.ts's DB layer (no scope narrowing — an admin-panel
// permission grants global reach, unlike the existing scoped requireRole
// surface at /api/users, which stays untouched). See users.controller.ts
// for the domain-role hierarchy checks this deliberately skips: authority
// here comes entirely from the permission the route required, not from
// comparing the actor's own users.role to the target's.

const roleEnum = z.enum(["superuser", "program_admin", "branch_admin", "student"]);
const idParamSchema = z.string().uuid();

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const { rows, total } = await usersService.listUsers({}, limit, offset);
    sendSuccess(res, { items: rows, pagination: buildPaginationMeta(page, limit, total) });
  } catch (err) {
    next(err);
  }
}

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  full_name: z.string().trim().min(1).max(150),
  role: roleEnum,
  program_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  enrollment_year: z.number().int().nullable().optional(),
});

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new Error("requireAuth did not run before createUser");
    const input = createUserSchema.parse(req.body);

    // Never put the password in the audit trail.
    const user = await withAudit(
      {
        actorUserId: req.user.id,
        action: "users.create",
        resource: "user",
        resourceId: null,
        metadata: { email: input.email, role: input.role },
      },
      () =>
        usersService.createUser({
          email: input.email,
          password: input.password,
          full_name: input.full_name,
          role: input.role,
          program_id: input.program_id ?? null,
          branch_id: input.branch_id ?? null,
          enrollment_year: input.enrollment_year ?? null,
        })
    );
    sendSuccess(res, user, 201);
  } catch (err) {
    next(err);
  }
}

const updateUserSchema = z.object({
  full_name: z.string().trim().min(1).max(150).optional(),
  role: roleEnum.optional(),
  program_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  enrollment_year: z.number().int().nullable().optional(),
});

export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new Error("requireAuth did not run before updateUser");
    const id = idParamSchema.parse(req.params.id);
    const input = updateUserSchema.parse(req.body);

    const user = await withAudit(
      { actorUserId: req.user.id, action: "users.update", resource: "user", resourceId: id, metadata: input },
      async () => {
        const updated = await usersService.updateUser(id, input);
        if (!updated) throw new ApiError(404, "NOT_FOUND", "User not found");
        return updated;
      }
    );
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new Error("requireAuth did not run before deleteUser");
    const id = idParamSchema.parse(req.params.id);

    await withAudit(
      { actorUserId: req.user.id, action: "users.delete", resource: "user", resourceId: id },
      async () => {
        const deleted = await usersService.deleteUser(id);
        if (!deleted) throw new ApiError(404, "NOT_FOUND", "User not found");
      }
    );
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}
