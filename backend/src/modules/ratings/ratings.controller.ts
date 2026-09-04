import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError.js";
import { assertNoteEngageable, assertNoteVisible } from "../../lib/noteAccess.js";
import { sendSuccess } from "../../lib/response.js";
import * as service from "./ratings.service.js";

const noteIdSchema = z.string().uuid();
// Mirrors the ratings_range CHECK. Validating here turns what would surface as
// a 500 from the constraint into a field-level 422 the form can point at.
const rateSchema = z.object({ rating: z.number().int().min(1).max(5) });

function parseNoteId(raw: unknown): string {
  const parsed = noteIdSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Note id must be a UUID");
  return parsed.data;
}

export async function rateNote(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const noteId = parseNoteId(req.params.noteId);
    const { rating } = rateSchema.parse(req.body);

    const note = await assertNoteEngageable(req.user, noteId);

    // Nothing in the schema stops an uploader rating their own note, and a
    // five-star self-rating on a fresh upload is the cheapest way to game the
    // "top rated" sort this unlocks.
    if (note.uploaderId !== null && note.uploaderId === req.user.id) {
      throw new ApiError(403, "FORBIDDEN", "You cannot rate a note you uploaded");
    }

    await service.rateNote(req.user.id, noteId, rating);
    sendSuccess(res, await service.getRatingSummary(noteId, req.user.id));
  } catch (err) {
    next(err);
  }
}

export async function clearRating(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const noteId = parseNoteId(req.params.noteId);

    // Visible, not engageable: a rating cast while a note was approved stays
    // withdrawable if the note is later pulled back for review.
    await assertNoteVisible(req.user, noteId);
    await service.clearRating(req.user.id, noteId);
    sendSuccess(res, await service.getRatingSummary(noteId, req.user.id));
  } catch (err) {
    next(err);
  }
}

export async function getRating(req: Request, res: Response, next: NextFunction) {
  try {
    const noteId = parseNoteId(req.params.noteId);
    await assertNoteVisible(req.user, noteId);
    sendSuccess(res, await service.getRatingSummary(noteId, req.user?.id ?? null));
  } catch (err) {
    next(err);
  }
}
