import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError.js";
import { assertNoteEngageable, assertNoteVisible } from "../../lib/noteAccess.js";
import { buildPaginationMeta, parsePagination } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import { MANAGER_ROLES } from "../../lib/taxonomyAccess.js";
import type { AuthUser } from "../../middleware/auth.js";
import * as service from "./comments.service.js";

const uuidSchema = z.string().uuid();
const listQuerySchema = z.object({ note_id: z.string().uuid() });
const createSchema = z.object({
  note_id: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});
const updateSchema = z.object({ body: z.string().trim().min(1).max(2000) });

function parseId(raw: unknown, noun: string): string {
  const parsed = uuidSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", `${noun} must be a UUID`);
  return parsed.data;
}

/**
 * A comment is the author's to edit, and an in-scope moderator's to delete.
 * Scope is checked against the note the comment hangs on, so a branch admin
 * cannot moderate a discussion in another branch.
 */
async function assertMayModerate(user: AuthUser, noteId: string): Promise<boolean> {
  if (!MANAGER_ROLES.includes(user.role)) return false;
  const note = await assertNoteVisible(user, noteId);
  if (user.role === "superuser") return true;
  if (user.role === "program_admin") return note.programId === user.programId;
  return note.branchId === user.branchId;
}

export async function listComments(req: Request, res: Response, next: NextFunction) {
  try {
    const { note_id: noteId } = listQuerySchema.parse(req.query);
    const { page, limit, offset } = parsePagination(req.query);

    // Gated on the note, not the comments: listing a thread otherwise confirms
    // a pending note exists to anyone who guesses its id.
    await assertNoteVisible(req.user, noteId);

    const { rows, total } = await service.listComments(noteId, limit, offset);
    sendSuccess(res, { items: rows, pagination: buildPaginationMeta(page, limit, total) });
  } catch (err) {
    next(err);
  }
}

export async function createComment(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const input = createSchema.parse(req.body);

    await assertNoteEngageable(req.user, input.note_id);

    const comment = await service.createComment(input.note_id, req.user.id, input.body);
    sendSuccess(res, comment, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateComment(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const id = parseId(req.params.id, "Comment id");
    const { body } = updateSchema.parse(req.body);

    const existing = await service.getCommentById(id);
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Comment not found");
    await assertNoteVisible(req.user, existing.note_id);

    // Editing is the author's alone. A moderator who disagrees with a comment
    // can remove it, but putting different words under someone's name is not
    // a moderation power worth having.
    if (existing.user_id !== req.user.id) {
      throw new ApiError(403, "FORBIDDEN", "You may only edit your own comments");
    }

    const updated = await service.updateComment(id, body);
    if (!updated) throw new ApiError(404, "NOT_FOUND", "Comment not found");
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteComment(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const id = parseId(req.params.id, "Comment id");

    const existing = await service.getCommentById(id);
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Comment not found");
    await assertNoteVisible(req.user, existing.note_id);

    const isAuthor = existing.user_id !== null && existing.user_id === req.user.id;
    if (!isAuthor && !(await assertMayModerate(req.user, existing.note_id))) {
      throw new ApiError(403, "FORBIDDEN", "You may not delete this comment");
    }

    await service.deleteComment(id);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}
