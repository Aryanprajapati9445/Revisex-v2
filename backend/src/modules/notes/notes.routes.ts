import { Router } from "express";
import { z } from "zod";
import { optionalAuth, requireAuth, requireRole, requireScope } from "../../middleware/auth.js";
import { ipRateLimit } from "../../middleware/rateLimit.js";
import * as controller from "./notes.controller.js";
import * as notesService from "./notes.service.js";

export const notesRouter = Router();

const uuidSchema = z.string().uuid();

// download/preview are 404-masked per-note (an out-of-scope or nonexistent
// file both look identical), which makes them the endpoints where a bare
// UUID-enumeration attempt would actually pay off. They also have no
// per-account cooldown the way login does, so this is the only backstop.
// The limit is generous relative to legitimate browsing (a student opening
// many files in a session) — it exists to blunt sustained automated
// scraping/guessing, not to throttle normal use.
const fileAccessRateLimit = ipRateLimit({ windowMs: 5 * 60_000, max: 120, prefix: "notes-file-access" });

notesRouter.get("/", optionalAuth, controller.listNotes);
notesRouter.get("/:id", optionalAuth, controller.getNote);

notesRouter.post("/", requireAuth, controller.createNote);
notesRouter.patch("/:id", requireAuth, controller.updateNote);
notesRouter.delete("/:id", requireAuth, controller.deleteNote);

notesRouter.get("/:id/files", optionalAuth, controller.listFiles);
notesRouter.get("/:id/files/:fileId/download", optionalAuth, fileAccessRateLimit, controller.downloadFile);
// Separate from download on purpose — see previewFile: viewing must not count
// as a download.
notesRouter.get("/:id/files/:fileId/preview", optionalAuth, fileAccessRateLimit, controller.previewFile);
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
