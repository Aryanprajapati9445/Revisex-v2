import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError.js";
import { buildPaginationMeta, parsePagination } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import { isInScope, resolveSubjectScope } from "../../lib/taxonomyAccess.js";
import { assertLoadedNoteVisible } from "../../lib/noteAccess.js";
import type { AuthUser } from "../../middleware/auth.js";
import type { Note, NoteFile } from "../../types/index.js";
import { normalizeTagName, setNoteTags } from "../tags/tags.service.js";
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
 * Reading a note, its file list and its download links all answer the same
 * question — may this viewer know it exists — so all three go through the one
 * rule in lib/noteAccess rather than restating it three times, which is how
 * they had drifted apart.
 */
async function assertNoteReadable(viewer: AuthUser | undefined, note: Note): Promise<void> {
  await assertLoadedNoteVisible(viewer, {
    id: note.id,
    status: note.status,
    uploaderId: note.uploader_id,
  });
}

/**
 * Whether a privileged user's own program/branch scope covers the given note.
 * Superusers are exempt (always in scope).
 *
 * Editing and deleting keep this rather than the visibility rule above: they
 * turn on ownership first and consult scope only for a non-owning admin, so
 * they need the scope answer on its own.
 */
async function isNoteInScope(user: AuthUser, noteId: string): Promise<boolean> {
  if (user.role === "superuser") return true;

  const scope = await notesService.getNoteScope(noteId);
  if (!scope) return false;

  if (user.role === "branch_admin") return user.branchId === scope.branchId;
  if (user.role === "program_admin") return user.programId === scope.programId;
  return false;
}

// Tags are free text from the uploader, normalized and de-duplicated
// server-side (see tags.service) so "Unit 1" and "unit  1" do not become two
// tags nobody can tell apart. Capped so one upload cannot flood the tag list.
const tagListSchema = z.array(z.string().trim().min(1).max(50)).max(10);

const createNoteSchema = z.object({
  subject_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  note_type: noteTypeEnum.default("other"),
  exam_year: z.number().int().min(1950).max(2200).nullable().optional(),
  tags: tagListSchema.optional(),
});

export async function createNote(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const input = createNoteSchema.parse(req.body);

    // Uploading is scoped the same way reviewing is: a student or branch_admin
    // may only post into their own branch, a program_admin anywhere in their
    // program, a superuser anywhere. Without this the subject_id in the body is
    // an unchecked pointer at any subject on the platform — and the upload form
    // widening past the uploader's own branch would turn that into a real hole.
    const subjectScope = await resolveSubjectScope(input.subject_id);
    if (!subjectScope) {
      throw new ApiError(422, "VALIDATION_ERROR", "subject_id does not reference an existing subject");
    }
    if (!isInScope(req.user, subjectScope)) {
      throw new ApiError(403, "FORBIDDEN", "That subject is outside the part of the platform you can upload to");
    }
    const note = await notesService.createNote(req.user.id, {
      subject_id: input.subject_id,
      title: input.title,
      description: input.description ?? null,
      note_type: input.note_type,
      exam_year: input.exam_year ?? null,
    });
    if (input.tags) await setNoteTags(note.id, input.tags);
    sendSuccess(res, note, 201);
  } catch (err) {
    next(err);
  }
}

const listQuerySchema = z.object({
  subject_id: z.string().uuid().optional(),
  branch_id: z.string().uuid().optional(),
  semester: z.coerce.number().int().min(1).max(20).optional(),
  note_type: noteTypeEnum.optional(),
  status: noteStatusEnum.optional(),
  tag: z.string().trim().min(1).max(50).optional(),
  uploader_id: z.string().uuid().optional(),
  q: z.string().min(1).max(200).optional(),
  sort: z.enum(["recent", "top_rated", "most_downloaded", "most_saved"]).default("recent"),
});

export async function listNotes(req: Request, res: Response, next: NextFunction) {
  try {
    const { sort, ...query } = listQuerySchema.parse(req.query);
    const { page, limit, offset } = parsePagination(req.query);

    const status = query.status && !req.user ? "approved" : query.status;
    const viewer = req.user ?? anonymousViewer;

    const { rows, total } = await notesService.listNotes(
      { filters: { ...query, status, tag: query.tag ? normalizeTagName(query.tag) : undefined }, viewer, sort },
      limit,
      offset
    );
    sendSuccess(res, { items: rows, pagination: buildPaginationMeta(page, limit, total) });
  } catch (err) {
    next(err);
  }
}

export async function getNote(req: Request, res: Response, next: NextFunction) {
  try {
    const note = await loadNoteOr404(req.params.id);
    await assertNoteReadable(req.user, note);

    // Enriched shape: subject, branch, program, stats, tags and this viewer's
    // own bookmark and rating, all resolved in the one query the projection
    // already does. The page previously walked the tree in four sequential
    // round-trips to render its breadcrumb.
    const card = await notesService.getNoteCard(note.id, req.user?.id ?? null);
    // Not `card ?? note`: falling back to the bare row would answer 200 with a
    // different shape than the contract promises — no tags, no stats — and the
    // client reads those unconditionally. The note was just loaded, so a miss
    // here means the taxonomy joins found nothing, which is a broken row rather
    // than a missing one.
    if (!card) throw new ApiError(404, "NOT_FOUND", "Note not found");
    sendSuccess(res, card);
  } catch (err) {
    next(err);
  }
}

const updateNoteSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  note_type: noteTypeEnum.optional(),
  exam_year: z.number().int().min(1950).max(2200).nullable().optional(),
  tags: tagListSchema.optional(),
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

    const { tags, ...fields } = updateNoteSchema.parse(req.body);
    const updated = await notesService.updateNote(note.id, fields);
    if (!updated) throw new ApiError(404, "NOT_FOUND", "Note not found");
    // Omitting tags leaves them alone; sending [] clears them.
    if (tags) await setNoteTags(note.id, tags);
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

/**
 * Resolves the file behind :id/:fileId, having first checked the caller may
 * see the note at all. Shared by download and preview so the two can never
 * drift on who is allowed to reach a file.
 */
async function loadDeliverableFile(req: Request): Promise<{ note: Note; file: NoteFile }> {
  const note = await loadNoteOr404(req.params.id);
  await assertNoteReadable(req.user, note);

  const fileIdResult = idParamSchema.safeParse(req.params.fileId);
  if (!fileIdResult.success) throw new ApiError(400, "VALIDATION_ERROR", "File id must be a UUID");

  const file: NoteFile | null = await notesService.getFileById(fileIdResult.data);
  if (!file || file.note_id !== note.id || file.upload_status !== "uploaded") {
    throw new ApiError(404, "NOT_FOUND", "File not found");
  }
  return { note, file };
}

export async function downloadFile(req: Request, res: Response, next: NextFunction) {
  try {
    const { note, file } = await loadDeliverableFile(req);

    const url = await notesService.getDownloadUrl(file.s3_key);
    await notesService.incrementDownloadCount(note.id);
    sendSuccess(res, { url });
  } catch (err) {
    next(err);
  }
}

/**
 * A link for showing a file in the page rather than saving it.
 *
 * Deliberately does NOT increment download_count. Opening a note to look at it
 * is not a download, and counting it as one would inflate the figure shown on
 * every card and corrupt the most_downloaded sort — a note nobody saves would
 * outrank one everybody does, purely because it renders in a viewer.
 */
export async function previewFile(req: Request, res: Response, next: NextFunction) {
  try {
    const { file } = await loadDeliverableFile(req);

    const url = await notesService.getDownloadUrl(file.s3_key);
    sendSuccess(res, {
      url,
      mime_type: file.mime_type,
      original_filename: file.original_filename,
      size_bytes: file.size_bytes,
    });
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
    await assertNoteReadable(req.user, note);

    const files = await notesService.listNoteFiles(note.id);
    sendSuccess(res, files);
  } catch (err) {
    next(err);
  }
}
