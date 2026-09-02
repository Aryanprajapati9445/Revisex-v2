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

const updateMeSchema = z.object({ full_name: z.string().min(1).max(150) });

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
  full_name: z.string().min(1).max(150),
  role: roleEnum,
  program_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  enrollment_year: z.number().int().nullable().optional(),
});

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const input = createUserSchema.parse(req.body);

    if (roleHierarchy[input.role] >= roleHierarchy[req.user.role]) {
      throw new ApiError(403, "FORBIDDEN", "You cannot create a user with a role equal to or above your own");
    }

    if (req.user.role === "program_admin") {
      if (!input.branch_id) throw new ApiError(422, "VALIDATION_ERROR", "branch_id is required for this role");
      const belongs = await usersService.branchBelongsToProgram(input.branch_id, req.user.programId!);
      if (!belongs) throw new ApiError(403, "FORBIDDEN", "That branch is outside your program");
      // If program_id is provided, it must match the actor's program
      if (input.program_id && input.program_id !== req.user.programId) {
        throw new ApiError(403, "FORBIDDEN", "You cannot create users in a different program");
      }
    } else if (req.user.role === "branch_admin") {
      if (input.role !== "student") throw new ApiError(403, "FORBIDDEN", "You may only create student accounts");
      if (input.branch_id !== req.user.branchId) {
        throw new ApiError(403, "FORBIDDEN", "You may only create students in your own branch");
      }
    } else if (req.user.role !== "superuser") {
      throw new ApiError(403, "FORBIDDEN", "Your role cannot create users");
    }

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
  full_name: z.string().min(1).max(150).optional(),
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
    if (input.role && roleHierarchy[input.role] >= roleHierarchy[req.user.role]) {
      throw new ApiError(403, "FORBIDDEN", "You cannot assign a role equal to or above your own");
    }

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
