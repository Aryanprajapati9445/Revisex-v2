import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError.js";
import { assertNoteEngageable } from "../../lib/noteAccess.js";
import { buildPaginationMeta, parsePagination } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import * as service from "./bookmarks.service.js";

const noteIdSchema = z.string().uuid();

function requireUser(req: Request) {
  if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
  return req.user;
}

function parseNoteId(raw: unknown): string {
  const parsed = noteIdSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Note id must be a UUID");
  return parsed.data;
}

export async function listBookmarks(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const { page, limit, offset } = parsePagination(req.query);
    const { rows, total } = await service.listBookmarks(user.id, limit, offset);
    sendSuccess(res, { items: rows, pagination: buildPaginationMeta(page, limit, total) });
  } catch (err) {
    next(err);
  }
}

export async function addBookmark(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const noteId = parseNoteId(req.params.noteId);

    // The note id is client-supplied, so this is the line standing between a
    // stranger and a pending note's title appearing in their saved list.
    await assertNoteEngageable(user, noteId);

    const { created } = await service.addBookmark(user.id, noteId);
    sendSuccess(res, { note_id: noteId, bookmarked: true }, created ? 201 : 200);
  } catch (err) {
    next(err);
  }
}

export async function removeBookmark(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const noteId = parseNoteId(req.params.noteId);

    // Deliberately not gated on the note still being approved: a note that was
    // rejected after it was saved must remain removable, or the entry would be
    // stuck in the list forever.
    await service.removeBookmark(user.id, noteId);
    sendSuccess(res, { note_id: noteId, bookmarked: false });
  } catch (err) {
    next(err);
  }
}
