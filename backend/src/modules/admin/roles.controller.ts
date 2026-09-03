import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { withAudit } from "../../lib/audit.js";
import { ApiError } from "../../lib/apiError.js";
import { sendSuccess } from "../../lib/response.js";
import { getUserPermissions } from "../../middleware/permissions.js";
import * as rolesService from "./roles.service.js";

const idParamSchema = z.string().uuid();

export async function listPermissions(_req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await rolesService.listPermissions());
  } catch (err) {
    next(err);
  }
}

/** The requesting user's own resolved permission set — drives frontend show/hide only. */
export async function getMyPermissions(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new Error("requireAuth did not run before getMyPermissions");
    const granted = await getUserPermissions(req.user.id);
    sendSuccess(res, { permissions: [...granted] });
  } catch (err) {
    next(err);
  }
}

export async function listRoles(_req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await rolesService.listRoles());
  } catch (err) {
    next(err);
  }
}

export async function getRole(req: Request, res: Response, next: NextFunction) {
  try {
    const id = idParamSchema.parse(req.params.id);
    const role = await rolesService.getRoleById(id);
    if (!role) throw new ApiError(404, "NOT_FOUND", "Role not found");
    sendSuccess(res, role);
  } catch (err) {
    next(err);
  }
}

const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  permissions: z.array(z.string()).default([]),
});

export async function createRole(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new Error("requireAuth did not run before createRole");
    const input = createRoleSchema.parse(req.body);

    const role = await withAudit(
      { actorUserId: req.user.id, action: "roles.create", resource: "role", resourceId: null, metadata: { name: input.name } },
      () => rolesService.createRole({ name: input.name, description: input.description ?? null, permissions: input.permissions })
    );
    sendSuccess(res, role, 201);
  } catch (err) {
    next(err);
  }
}

const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

export async function updateRole(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new Error("requireAuth did not run before updateRole");
    const id = idParamSchema.parse(req.params.id);
    const input = updateRoleSchema.parse(req.body);

    const role = await withAudit(
      { actorUserId: req.user.id, action: "roles.update", resource: "role", resourceId: id, metadata: input },
      () => rolesService.updateRole(id, input)
    );
    sendSuccess(res, role);
  } catch (err) {
    next(err);
  }
}

const setPermissionsSchema = z.object({ permissions: z.array(z.string()) });

export async function setRolePermissions(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new Error("requireAuth did not run before setRolePermissions");
    const id = idParamSchema.parse(req.params.id);
    const { permissions } = setPermissionsSchema.parse(req.body);

    const role = await withAudit(
      { actorUserId: req.user.id, action: "roles.set_permissions", resource: "role", resourceId: id, metadata: { permissions } },
      () => rolesService.setRolePermissions(id, permissions)
    );
    sendSuccess(res, role);
  } catch (err) {
    next(err);
  }
}

export async function deleteRole(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new Error("requireAuth did not run before deleteRole");
    const id = idParamSchema.parse(req.params.id);

    await withAudit(
      { actorUserId: req.user.id, action: "roles.delete", resource: "role", resourceId: id },
      () => rolesService.deleteRole(id)
    );
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}

export async function getUserRoles(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = idParamSchema.parse(req.params.id);
    sendSuccess(res, await rolesService.listUserRoles(userId));
  } catch (err) {
    next(err);
  }
}

const setUserRolesSchema = z.object({ roles: z.array(z.string().uuid()) });

export async function setUserRoles(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new Error("requireAuth did not run before setUserRoles");
    const userId = idParamSchema.parse(req.params.id);
    const { roles } = setUserRolesSchema.parse(req.body);

    const result = await withAudit(
      { actorUserId: req.user.id, action: "users.set_roles", resource: "user", resourceId: userId, metadata: { roles } },
      () => rolesService.setUserRoles(userId, roles)
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
