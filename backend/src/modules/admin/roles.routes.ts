import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import * as controller from "./roles.controller.js";

export const rolesRouter = Router();

rolesRouter.use(requireAuth);

// Any authenticated user may read their own resolved permission set — it
// only drives their own nav visibility, so it needs no extra permission.
rolesRouter.get("/permissions/me", controller.getMyPermissions);

rolesRouter.get("/permissions", requirePermission("roles.manage"), controller.listPermissions);

rolesRouter.get("/roles", requirePermission("roles.manage"), controller.listRoles);
rolesRouter.post("/roles", requirePermission("roles.manage"), controller.createRole);
rolesRouter.get("/roles/:id", requirePermission("roles.manage"), controller.getRole);
rolesRouter.patch("/roles/:id", requirePermission("roles.manage"), controller.updateRole);
rolesRouter.put("/roles/:id/permissions", requirePermission("roles.manage"), controller.setRolePermissions);
rolesRouter.delete("/roles/:id", requirePermission("roles.manage"), controller.deleteRole);

rolesRouter.get("/users/:id/roles", requirePermission("users.read"), controller.getUserRoles);
rolesRouter.put("/users/:id/roles", requirePermission("roles.manage"), controller.setUserRoles);
