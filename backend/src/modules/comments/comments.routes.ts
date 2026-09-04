import { Router } from "express";
import { optionalAuth, requireAuth } from "../../middleware/auth.js";
import * as controller from "./comments.controller.js";

export const commentsRouter = Router();

// Reading a thread on an approved note is public, matching the note itself.
commentsRouter.get("/", optionalAuth, controller.listComments);
commentsRouter.post("/", requireAuth, controller.createComment);
commentsRouter.patch("/:id", requireAuth, controller.updateComment);
commentsRouter.delete("/:id", requireAuth, controller.deleteComment);
