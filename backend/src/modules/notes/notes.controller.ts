import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError.js";
import { buildPaginationMeta, parsePagination } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import type { AuthUser } from "../../middleware/auth.js";
import type { NoteFile } from "../../types/index.js";
import * as notesService from "./notes.service.js";

const noteTypeEnum = z.enum(["lecture_notes", "pyq", "lab_manual", "assignment", "book", "other"]);
const noteStatusEnum = z.enum(["pending", "approved", "rejected"]);
const idParamSchema = z.string().uuid();

const anonymousViewer: AuthUser = { id: "", role: "student", programId: null, branchId: null };

export function isPrivilegedRole(role: string): boolean {
  return role === "superuser" || role === "program_admin" || role === "branch_admin";
}

async function loadNoteOr404(id: unknown) {
  const parsed = idParamSchema.safeParse(id);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Note id must be a UUID");
  const note = await notesService.getNoteById(parsed.data);
  if (!note) throw new ApiError(404, "NOT_FOUND", "Note not found");
  return note;
}

/**
 * Whether a privileged user's own program/branch scope covers the given note.
 * Superusers are exempt (always in scope). Callers still need to decide
 * separately whether the user is even a privileged role or the note's owner —
 * this only answers the scope question for an admin who is neither.
 */
async function isNoteInScope(user: AuthUser, noteId: string): Promise<boolean> {
  if (user.role === "superuser") return true;

  const scope = await notesService.getNoteScope(noteId);
  if (!scope) return false;

  if (user.role === "branch_admin") return user.branchId === scope.branchId;
  if (user.role === "program_admin") return user.programId === scope.programId;
  return false;
}

const createNoteSchema = z.object({
  subject_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  note_type: noteTypeEnum.default("other"),
  exam_year: z.number().int().min(1950).max(2200).nullable().optional(),
});

export async function createNote(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const input = createNoteSchema.parse(req.body);
    const note = await notesService.createNote(req.user.id, {
      subject_id: input.subject_id,
      title: input.title,
      description: input.description ?? null,
      note_type: input.note_type,
      exam_year: input.exam_year ?? null,
    });
    sendSuccess(res, note, 201);
  } catch (err) {
    next(err);
  }
}

const listQuerySchema = z.object({
  subject_id: z.string().uuid().optional(),
  note_type: noteTypeEnum.optional(),
  status: noteStatusEnum.optional(),
  q: z.string().min(1).max(200).optional(),
});

export async function listNotes(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listQuerySchema.parse(req.query);
    const { page, limit, offset } = parsePagination(req.query);

    const status = query.status && !req.user ? "approved" : query.status;
    const viewer = req.user ?? anonymousViewer;

    const { rows, total } = await notesService.listNotes({ filters: { ...query, status }, viewer }, limit, offset);
    sendSuccess(res, { items: rows, pagination: buildPaginationMeta(page, limit, total) });
  } catch (err) {
    next(err);
  }
}

export async function getNote(req: Request, res: Response, next: NextFunction) {
  try {
    const note = await loadNoteOr404(req.params.id);

    if (note.status !== "approved") {
      const isOwner = req.user?.id === note.uploader_id;
      const isPrivileged = !!req.user && isPrivilegedRole(req.user.role);

      if (!isOwner && !isPrivileged) {
        throw new ApiError(404, "NOT_FOUND", "Note not found");
      }

      // For privileged roles (non-owner), check scope
      if (isPrivileged && !isOwner) {
        const inScope = await isNoteInScope(req.user!, note.id);
        if (!inScope) throw new ApiError(404, "NOT_FOUND", "Note not found");
      }
    }

    sendSuccess(res, note);
  } catch (err) {
    next(err);
  }
}

const updateNoteSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  note_type: noteTypeEnum.optional(),
  exam_year: z.number().int().min(1950).max(2200).nullable().optional(),
});

export async function updateNote(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const note = await loadNoteOr404(req.params.id);

    const isOwner = note.uploader_id === req.user.id;
    if (!isOwner && !isPrivilegedRole(req.user.role)) {
      throw new ApiError(403, "FORBIDDEN", "You may not edit this note");
    }
    if (isOwner && !isPrivilegedRole(req.user.role) && note.status !== "pending") {
      throw new ApiError(403, "FORBIDDEN", "This note has already been reviewed and can no longer be edited");
    }

    // For privileged roles (non-owner), check scope. This is a masking
    // decision (same as getNote/downloadFile), so an out-of-scope admin gets
    // the same 404 a non-existent note would — not a 403 that would confirm
    // the note exists somewhere outside their scope.
    if (!isOwner && isPrivilegedRole(req.user.role)) {
      const inScope = await isNoteInScope(req.user, note.id);
      if (!inScope) throw new ApiError(404, "NOT_FOUND", "Note not found");
    }

    const input = updateNoteSchema.parse(req.body);
    const updated = await notesService.updateNote(note.id, input);
    if (!updated) throw new ApiError(404, "NOT_FOUND", "Note not found");
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteNote(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const note = await loadNoteOr404(req.params.id);

    const isOwner = note.uploader_id === req.user.id;
    if (!isOwner && !isPrivilegedRole(req.user.role)) {
      throw new ApiError(403, "FORBIDDEN", "You may not delete this note");
    }

    // For privileged roles (non-owner), check scope — masked as 404, matching
    // getNote/downloadFile/updateNote (see comment in updateNote above).
    if (!isOwner && isPrivilegedRole(req.user.role)) {
      const inScope = await isNoteInScope(req.user, note.id);
      if (!inScope) throw new ApiError(404, "NOT_FOUND", "Note not found");
    }

    await notesService.deleteNote(note.id);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}

export { loadNoteOr404 };

const requestFilesSchema = z.object({
  files: z
    .array(
      z.object({
        original_filename: z.string().min(1).max(255),
        mime_type: z.string().min(1).max(120),
      })
    )
    .min(1)
    .max(10),
});

export async function requestFiles(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const note = await loadNoteOr404(req.params.id);

    if (note.uploader_id !== req.user.id) {
      throw new ApiError(403, "FORBIDDEN", "Only the uploader may add files to this note");
    }
    if (note.status !== "pending") {
      throw new ApiError(403, "FORBIDDEN", "Files can only be added while the note is pending review");
    }

    const { files } = requestFilesSchema.parse(req.body);
    const results = await notesService.createPendingFiles(note.id, files);
    sendSuccess(res, results, 201);
  } catch (err) {
    next(err);
  }
}

const completeFileSchema = z.object({ size_bytes: z.number().int().positive() });

export async function completeFile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const note = await loadNoteOr404(req.params.id);
    if (note.uploader_id !== req.user.id) {
      throw new ApiError(403, "FORBIDDEN", "Only the uploader may confirm uploads for this note");
    }
    if (note.status !== "pending") {
      throw new ApiError(403, "FORBIDDEN", "Files can only be completed while the note is pending review");
    }

    const fileIdResult = idParamSchema.safeParse(req.params.fileId);
    if (!fileIdResult.success) throw new ApiError(400, "VALIDATION_ERROR", "File id must be a UUID");

    const file: NoteFile | null = await notesService.getFileById(fileIdResult.data);
    if (!file || file.note_id !== note.id) throw new ApiError(404, "NOT_FOUND", "File not found");

    const { size_bytes } = completeFileSchema.parse(req.body);
    const updated = await notesService.completeFileUpload(file.id, size_bytes);
    if (!updated) {
      throw new ApiError(409, "CONFLICT", "This file has already been marked as uploaded");
    }
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}

export async function downloadFile(req: Request, res: Response, next: NextFunction) {
  try {
    const note = await loadNoteOr404(req.params.id);

    if (note.status !== "approved") {
      const isOwner = req.user?.id === note.uploader_id;
      const isPrivileged = !!req.user && isPrivilegedRole(req.user.role);

      if (!isOwner && !isPrivileged) {
        throw new ApiError(404, "NOT_FOUND", "Note not found");
      }

      // For privileged roles (non-owner), check scope
      if (isPrivileged && !isOwner) {
        const inScope = await isNoteInScope(req.user!, note.id);
        if (!inScope) throw new ApiError(404, "NOT_FOUND", "Note not found");
      }
    }

    const fileIdResult = idParamSchema.safeParse(req.params.fileId);
    if (!fileIdResult.success) throw new ApiError(400, "VALIDATION_ERROR", "File id must be a UUID");

    const file: NoteFile | null = await notesService.getFileById(fileIdResult.data);
    if (!file || file.note_id !== note.id || file.upload_status !== "uploaded") {
      throw new ApiError(404, "NOT_FOUND", "File not found");
    }

    const url = await notesService.getDownloadUrl(file.s3_key);
    await notesService.incrementDownloadCount(note.id);
    sendSuccess(res, { url });
  } catch (err) {
    next(err);
  }
}

const reviewSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    rejection_reason: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((data) => data.decision !== "rejected" || !!data.rejection_reason, {
    message: "rejection_reason is required when decision is 'rejected'",
    path: ["rejection_reason"],
  });

export async function reviewNote(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const note = await loadNoteOr404(req.params.id);
    const input = reviewSchema.parse(req.body);

    const updated = await notesService.reviewNote(note.id, req.user.id, input.decision, input.rejection_reason ?? null);
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}

export async function listFiles(req: Request, res: Response, next: NextFunction) {
  try {
    const note = await loadNoteOr404(req.params.id);

    // Same visibility rule as getNote: a non-approved note is visible only to
    // its uploader or an in-scope admin, and a scope miss reads as 404 so it
    // cannot be distinguished from a note that does not exist.
    if (note.status !== "approved") {
      const isOwner = req.user?.id === note.uploader_id;
      const isPrivileged = !!req.user && isPrivilegedRole(req.user.role);
      const inScope = isPrivileged && (await isNoteInScope(req.user!, note.id));
      if (!isOwner && !inScope) throw new ApiError(404, "NOT_FOUND", "Note not found");
    }

    const files = await notesService.listNoteFiles(note.id);
    sendSuccess(res, files);
  } catch (err) {
    next(err);
  }
}
