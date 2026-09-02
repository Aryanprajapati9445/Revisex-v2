import { Router } from "express";
import { z } from "zod";
import { optionalAuth, requireAuth, requireRole, requireScope } from "../../middleware/auth.js";
import * as controller from "./notes.controller.js";
import * as notesService from "./notes.service.js";

export const notesRouter = Router();

const uuidSchema = z.string().uuid();

notesRouter.get("/", optionalAuth, controller.listNotes);
notesRouter.get("/:id", optionalAuth, controller.getNote);

notesRouter.post("/", requireAuth, controller.createNote);
notesRouter.patch("/:id", requireAuth, controller.updateNote);
notesRouter.delete("/:id", requireAuth, controller.deleteNote);

notesRouter.get("/:id/files/:fileId/download", optionalAuth, controller.downloadFile);
notesRouter.post("/:id/files", requireAuth, controller.requestFiles);
notesRouter.post("/:id/files/:fileId/complete", requireAuth, controller.completeFile);

notesRouter.post(
  "/:id/review",
  requireAuth,
  requireRole("superuser", "program_admin", "branch_admin"),
  requireScope((req) => {
    const idResult = uuidSchema.safeParse(req.params.id);
    if (!idResult.success) return Promise.resolve(null);
    return notesService.getNoteScope(idResult.data);
  }),
  controller.reviewNote
);
