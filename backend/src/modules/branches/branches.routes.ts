import { Router } from "express";
import { getBranch, listBranches } from "./branches.controller.js";

export const branchesRouter = Router();

// Public: browsing the taxonomy needs no account.
branchesRouter.get("/", listBranches);
branchesRouter.get("/:id", getBranch);
