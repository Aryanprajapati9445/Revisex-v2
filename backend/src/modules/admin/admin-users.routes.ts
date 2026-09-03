import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import * as controller from "./admin-users.controller.js";

export const adminUsersRouter = Router();

adminUsersRouter.use(requireAuth);

adminUsersRouter.get("/", requirePermission("users.read"), controller.listUsers);
adminUsersRouter.post("/", requirePermission("users.create"), controller.createUser);
adminUsersRouter.patch("/:id", requirePermission("users.update"), controller.updateUser);
adminUsersRouter.delete("/:id", requirePermission("users.delete"), controller.deleteUser);
