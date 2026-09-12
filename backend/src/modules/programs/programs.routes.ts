import { Router } from "express";
import { optionalAuth, requireAuth, requireRole } from "../../middleware/auth.js";
import {
  createProgram,
  deactivateProgram,
  getProgram,
  listPrograms,
  updateProgram,
} from "./programs.controller.js";

export const programsRouter = Router();

// optionalAuth, not requireAuth: browsing stays anonymous, but the controller
// needs to know who is asking before it will serve the administrative view
// (?with_counts / ?include_inactive) or resolve a deactivated row.
programsRouter.get("/", optionalAuth, listPrograms);
programsRouter.get("/:id", optionalAuth, getProgram);

// A program is the top tier of the org chart — only a superuser owns it. A
// program_admin manages what is inside their program, not the set of programs.
programsRouter.post("/", requireAuth, requireRole("superuser"), createProgram);
programsRouter.patch("/:id", requireAuth, requireRole("superuser"), updateProgram);
programsRouter.delete("/:id", requireAuth, requireRole("superuser"), deactivateProgram);
