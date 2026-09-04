import { Router } from "express";
import { optionalAuth, requireAuth, requireRole } from "../../middleware/auth.js";
import {
  createSubject,
  deactivateSubject,
  getSubject,
  listSubjects,
  updateSubject,
} from "./subjects.controller.js";

export const subjectsRouter = Router();

// Public: browsing the taxonomy needs no account. optionalAuth only so the
// controller can recognise a manager asking for the administrative view.
subjectsRouter.get("/", optionalAuth, listSubjects);
subjectsRouter.get("/:id", optionalAuth, getSubject);

// Subjects are the tier a branch_admin genuinely owns, so all three manager
// roles reach them; the controller narrows each one to their own scope.
const MANAGERS = ["superuser", "program_admin", "branch_admin"] as const;

subjectsRouter.post("/", requireAuth, requireRole(...MANAGERS), createSubject);
subjectsRouter.patch("/:id", requireAuth, requireRole(...MANAGERS), updateSubject);
subjectsRouter.delete("/:id", requireAuth, requireRole(...MANAGERS), deactivateSubject);
