import { Router } from "express";
import { optionalAuth, requireAuth, requireRole } from "../../middleware/auth.js";
import {
  createBranch,
  deactivateBranch,
  getBranch,
  listBranches,
  updateBranch,
} from "./branches.controller.js";

export const branchesRouter = Router();

// Public: browsing the taxonomy needs no account. optionalAuth only so the
// controller can recognise a manager asking for the administrative view.
branchesRouter.get("/", optionalAuth, listBranches);
branchesRouter.get("/:id", optionalAuth, getBranch);

// requireRole is the coarse gate; the controller then narrows to the actor's
// own program via taxonomyAccess (a program_admin may only touch their own).
branchesRouter.post("/", requireAuth, requireRole("superuser", "program_admin"), createBranch);
// branch_admin is included for update alone: renaming their own branch is
// theirs to do, but removing the branch they administer is not.
branchesRouter.patch("/:id", requireAuth, requireRole("superuser", "program_admin", "branch_admin"), updateBranch);
branchesRouter.delete("/:id", requireAuth, requireRole("superuser", "program_admin"), deactivateBranch);
