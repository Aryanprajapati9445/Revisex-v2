import { Router } from "express";
import { optionalAuth, requireAuth } from "../../middleware/auth.js";
import * as controller from "./notes.controller.js";

export const notesRouter = Router();

notesRouter.get("/", optionalAuth, controller.listNotes);
notesRouter.get("/:id", optionalAuth, controller.getNote);

notesRouter.post("/", requireAuth, controller.createNote);
notesRouter.patch("/:id", requireAuth, controller.updateNote);
notesRouter.delete("/:id", requireAuth, controller.deleteNote);
