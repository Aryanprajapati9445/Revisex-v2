import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as controller from "./users.controller.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get("/me", controller.getMe);
usersRouter.patch("/me", controller.updateMe);

usersRouter.get("/", requireRole("superuser", "program_admin", "branch_admin"), controller.listUsers);
usersRouter.post("/", requireRole("superuser", "program_admin", "branch_admin"), controller.createUser);
usersRouter.patch("/:id", requireRole("superuser", "program_admin", "branch_admin"), controller.updateUser);
usersRouter.delete("/:id", requireRole("superuser", "program_admin", "branch_admin"), controller.deleteUser);
