import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError.js";
import { buildPaginationMeta, parsePagination } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import type { AuthUser } from "../../middleware/auth.js";
import type { User, UserRole } from "../../types/index.js";
import * as usersService from "./users.service.js";

const roleEnum = z.enum(["superuser", "program_admin", "branch_admin", "student"]);

const roleHierarchy: Record<UserRole, number> = {
  superuser: 4,
  program_admin: 3,
  branch_admin: 2,
  student: 1,
};

const idParamSchema = z.string().uuid();

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const user = await usersService.getUserById(req.user.id);
    if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

const updateMeSchema = z.object({ full_name: z.string().trim().min(1).max(150) });

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const { full_name } = updateMeSchema.parse(req.body);
    const user = await usersService.updateOwnProfile(req.user.id, full_name);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

const listQuerySchema = z.object({
  role: roleEnum.optional(),
  branch_id: z.string().uuid().optional(),
});

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");

    const { role, branch_id } = listQuerySchema.parse(req.query);
    const { page, limit, offset } = parsePagination(req.query);

    const options: usersService.ListUsersOptions = { role, branchId: branch_id };
    if (req.user.role === "branch_admin") {
      options.branchScopeId = req.user.branchId!;
    } else if (req.user.role === "program_admin") {
      options.programScopeId = req.user.programId!;
    }

    const { rows, total } = await usersService.listUsers(options, limit, offset);
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

/**
 * Mirrors the `users_role_scope` CHECK constraint at the application level so a
 * violation is rejected with a clean 422 before it ever reaches the database.
 */
function isRoleScopeCombinationValid(
  role: UserRole,
  programId: string | null,
  branchId: string | null
): boolean {
  return (
    (role === "superuser" && programId === null && branchId === null) ||
    (role === "program_admin" && programId !== null && branchId === null) ||
    (role === "branch_admin" && programId === null && branchId !== null) ||
    (role === "student" && programId === null && branchId !== null)
  );
}

/**
 * Validates that an actor is allowed to create/update a user ending up with the
 * given (role, program_id, branch_id) combination. Used by both createUser and
 * updateUser so cross-program/cross-branch privilege escalation is impossible
 * whether it happens at creation time or via a later PATCH.
 */
async function assertRoleScopeAllowed(
  actor: AuthUser,
  resultingRole: UserRole,
  resultingProgramId: string | null,
  resultingBranchId: string | null
): Promise<void> {
  if (roleHierarchy[resultingRole] >= roleHierarchy[actor.role]) {
    throw new ApiError(403, "FORBIDDEN", "You cannot assign a role equal to or above your own");
  }

  if (!isRoleScopeCombinationValid(resultingRole, resultingProgramId, resultingBranchId)) {
    throw new ApiError(422, "VALIDATION_ERROR", "program_id/branch_id combination is not valid for this role");
  }

  if (actor.role === "superuser") return;

  if (actor.role === "program_admin") {
    if (resultingBranchId) {
      // Distinguish "branch doesn't exist" (a validation problem, mirroring the
      // FK violation the DB would otherwise raise) from "branch exists but
      // belongs to a different program" (an actual scope violation).
      const branchProgramId = await usersService.getBranchProgramId(resultingBranchId);
      if (branchProgramId === null) {
        throw new ApiError(422, "VALIDATION_ERROR", "branch_id does not reference an existing branch");
      }
      if (branchProgramId !== actor.programId) {
        throw new ApiError(403, "FORBIDDEN", "That branch is outside your program");
      }
    }
    if (resultingProgramId && resultingProgramId !== actor.programId) {
      throw new ApiError(403, "FORBIDDEN", "You cannot manage users in a different program");
    }
    return;
  }

  if (actor.role === "branch_admin") {
    if (resultingRole !== "student") throw new ApiError(403, "FORBIDDEN", "You may only manage student accounts");
    if (resultingBranchId !== actor.branchId) {
      throw new ApiError(403, "FORBIDDEN", "You may only manage students in your own branch");
    }
    return;
  }

  throw new ApiError(403, "FORBIDDEN", "Your role cannot manage users");
}

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const input = createUserSchema.parse(req.body);

    await assertRoleScopeAllowed(req.user, input.role, input.program_id ?? null, input.branch_id ?? null);

    const user = await usersService.createUser({
      email: input.email,
      password: input.password,
      full_name: input.full_name,
      role: input.role,
      program_id: input.program_id ?? null,
      branch_id: input.branch_id ?? null,
      enrollment_year: input.enrollment_year ?? null,
    });
    sendSuccess(res, user, 201);
  } catch (err) {
    next(err);
  }
}

async function assertManageable(actor: AuthUser, target: User): Promise<void> {
  if (actor.role === "superuser") return;
  if (actor.role === "program_admin") {
    const inScope =
      target.program_id === actor.programId ||
      (target.branch_id ? await usersService.branchBelongsToProgram(target.branch_id, actor.programId!) : false);
    if (!inScope) throw new ApiError(404, "NOT_FOUND", "User not found");
    // Reject if target has equal or higher role (cannot manage peers or superiors)
    if (roleHierarchy[target.role] >= roleHierarchy[actor.role]) {
      throw new ApiError(403, "FORBIDDEN", "You cannot manage users with equal or higher roles");
    }
    return;
  }
  if (actor.role === "branch_admin") {
    if (target.branch_id !== actor.branchId) throw new ApiError(404, "NOT_FOUND", "User not found");
    // Reject if target has equal or higher role (cannot manage peers or superiors)
    if (roleHierarchy[target.role] >= roleHierarchy[actor.role]) {
      throw new ApiError(403, "FORBIDDEN", "You cannot manage users with equal or higher roles");
    }
    return;
  }
  throw new ApiError(403, "FORBIDDEN", "Your role cannot manage users");
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
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const idResult = idParamSchema.safeParse(req.params.id);
    if (!idResult.success) throw new ApiError(400, "VALIDATION_ERROR", "User id must be a UUID");

    const target = await usersService.getUserById(idResult.data);
    if (!target) throw new ApiError(404, "NOT_FOUND", "User not found");
    await assertManageable(req.user, target);

    const input = updateUserSchema.parse(req.body);

    // A partial PATCH may only send e.g. `role` without `branch_id` — the
    // resulting scope is the merge of the patch over the target's current
    // row, since the omitted fields keep their existing values in effect.
    const resultingRole = input.role ?? target.role;
    const resultingProgramId = "program_id" in input ? (input.program_id ?? null) : target.program_id;
    const resultingBranchId = "branch_id" in input ? (input.branch_id ?? null) : target.branch_id;
    await assertRoleScopeAllowed(req.user, resultingRole, resultingProgramId, resultingBranchId);

    const updated = await usersService.updateUser(idResult.data, input);
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const idResult = idParamSchema.safeParse(req.params.id);
    if (!idResult.success) throw new ApiError(400, "VALIDATION_ERROR", "User id must be a UUID");

    const target = await usersService.getUserById(idResult.data);
    if (!target) throw new ApiError(404, "NOT_FOUND", "User not found");
    await assertManageable(req.user, target);

    await usersService.deleteUser(idResult.data);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}
