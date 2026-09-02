import { Router } from "express";
import { getProgram, listPrograms } from "./programs.controller.js";

export const programsRouter = Router();

programsRouter.get("/", listPrograms);
programsRouter.get("/:id", getProgram);
