import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError.js";
import { buildPaginationMeta, parsePagination } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import type { AuthUser } from "../../middleware/auth.js";
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

const createNoteSchema = z.object({
  subject_id: z.string().uuid(),
  title: z.string().min(1).max(200),
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
        const scope = await notesService.getNoteScope(note.id);
        if (!scope) {
          throw new ApiError(404, "NOT_FOUND", "Note not found");
        }

        const userRole = req.user!.role;
        if (userRole === "superuser") {
          // Superuser sees everything
        } else if (userRole === "branch_admin" && req.user!.branchId !== scope.branchId) {
          throw new ApiError(404, "NOT_FOUND", "Note not found");
        } else if (userRole === "program_admin" && req.user!.programId !== scope.programId) {
          throw new ApiError(404, "NOT_FOUND", "Note not found");
        }
      }
    }

    sendSuccess(res, note);
  } catch (err) {
    next(err);
  }
}

const updateNoteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
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

    // For privileged roles (non-owner), check scope
    if (!isOwner && isPrivilegedRole(req.user.role)) {
      const scope = await notesService.getNoteScope(note.id);
      if (!scope) {
        throw new ApiError(403, "FORBIDDEN", "This note is outside your scope");
      }

      const userRole = req.user.role;
      if (userRole === "superuser") {
        // Superuser can edit anything
      } else if (userRole === "branch_admin" && req.user.branchId !== scope.branchId) {
        throw new ApiError(403, "FORBIDDEN", "This note is outside your scope");
      } else if (userRole === "program_admin" && req.user.programId !== scope.programId) {
        throw new ApiError(403, "FORBIDDEN", "This note is outside your scope");
      }
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

    // For privileged roles (non-owner), check scope
    if (!isOwner && isPrivilegedRole(req.user.role)) {
      const scope = await notesService.getNoteScope(note.id);
      if (!scope) {
        throw new ApiError(403, "FORBIDDEN", "This note is outside your scope");
      }

      const userRole = req.user.role;
      if (userRole === "superuser") {
        // Superuser can delete anything
      } else if (userRole === "branch_admin" && req.user.branchId !== scope.branchId) {
        throw new ApiError(403, "FORBIDDEN", "This note is outside your scope");
      } else if (userRole === "program_admin" && req.user.programId !== scope.programId) {
        throw new ApiError(403, "FORBIDDEN", "This note is outside your scope");
      }
    }

    await notesService.deleteNote(note.id);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}

export { loadNoteOr404 };
