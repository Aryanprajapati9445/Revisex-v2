import { Router } from "express";
import { getSubject, listSubjects } from "./subjects.controller.js";

export const subjectsRouter = Router();

// Public: browsing the taxonomy needs no account.
subjectsRouter.get("/", listSubjects);
subjectsRouter.get("/:id", getSubject);
