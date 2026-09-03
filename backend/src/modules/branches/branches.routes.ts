import { Router } from "express";
import { listBranches } from "./branches.controller.js";

export const branchesRouter = Router();

// Public: browsing the taxonomy needs no account.
branchesRouter.get("/", listBranches);
