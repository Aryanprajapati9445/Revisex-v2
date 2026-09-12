import { pool } from "../config/db.js";
import { ApiError } from "./apiError.js";
import type { AuthUser } from "../middleware/auth.js";
import type { UserRole } from "../types/index.js";

/**
 * Where a taxonomy row sits in the program -> branch tree. `branchId` is null
 * for a program (a program is above the branch tier), set for a branch and for
 * a subject (a subject inherits its branch's scope).
 */
export interface TaxonomyScope {
  programId: string;
  branchId: string | null;
}

export const MANAGER_ROLES: UserRole[] = ["superuser", "program_admin", "branch_admin"];

/**
 * Resolves a branch's scope regardless of is_active. The public read services
 * deliberately hide soft-removed rows; management has to reach them anyway, or
 * a deactivated branch could never be edited or restored.
 */
export async function resolveBranchScope(branchId: string): Promise<TaxonomyScope | null> {
  const { rows } = await pool.query<{ program_id: string }>(`SELECT program_id FROM branches WHERE id = $1`, [
    branchId,
  ]);
  const row = rows[0];
  return row ? { programId: row.program_id, branchId } : null;
}

export async function resolveSubjectScope(subjectId: string): Promise<TaxonomyScope | null> {
  const { rows } = await pool.query<{ program_id: string; branch_id: string }>(
    `SELECT b.program_id, s.branch_id
       FROM subjects s JOIN branches b ON b.id = s.branch_id
      WHERE s.id = $1`,
    [subjectId]
  );
  const row = rows[0];
  return row ? { programId: row.program_id, branchId: row.branch_id } : null;
}

export async function programExists(programId: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT 1 FROM programs WHERE id = $1`, [programId]);
  return rows.length > 0;
}

/**
 * True when the actor's own program/branch covers the given scope. A student is
 * scoped to their own branch exactly as a branch_admin is — the same rule
 * middleware/auth.ts's requireScope applies — because a student uploading into
 * their branch is a legitimate in-scope write.
 */
export function isInScope(user: AuthUser, scope: TaxonomyScope): boolean {
  if (user.role === "superuser") return true;
  if (user.role === "program_admin") return scope.programId === user.programId;
  return scope.branchId !== null && scope.branchId === user.branchId;
}

/**
 * 404, not 403, when the row exists but sits outside the actor's scope — the
 * same masking rule middleware/auth.ts's requireScope applies, so an admin
 * cannot probe for rows in another program by watching status codes.
 */
export function assertInScope(user: AuthUser, scope: TaxonomyScope | null, noun: string): TaxonomyScope {
  if (!scope || !isInScope(user, scope)) {
    throw new ApiError(404, "NOT_FOUND", `${noun} not found`);
  }
  return scope;
}

/**
 * Whether the actor may create rows at a given tier at all — a separate
 * question from whether a specific existing row is in their scope, so it
 * answers 403 rather than 404 (nothing exists yet to be masked).
 */
export function assertCanCreate(user: AuthUser, tier: "program" | "branch" | "subject"): void {
  const allowed: Record<"program" | "branch" | "subject", UserRole[]> = {
    program: ["superuser"],
    branch: ["superuser", "program_admin"],
    subject: ["superuser", "program_admin", "branch_admin"],
  };
  if (!allowed[tier].includes(user.role)) {
    throw new ApiError(403, "FORBIDDEN", `Your role is not permitted to create a ${tier}`);
  }
}

/**
 * The slice of the tree an actor may see or act on. Superusers get nulls (the
 * whole platform); everyone else is pinned to their own program or branch.
 *
 * A branch_admin and a student both carry branch_id with program_id null (the
 * users_role_scope CHECK constraint requires exactly that), so their program
 * has to be resolved through the branch rather than read off the JWT.
 */
export interface ActorScope {
  programId: string | null;
  branchId: string | null;
}

export async function resolveActorScope(user: AuthUser): Promise<ActorScope> {
  if (user.role === "superuser") return { programId: null, branchId: null };
  if (user.role === "program_admin") return { programId: user.programId, branchId: null };
  if (!user.branchId) return { programId: null, branchId: null };
  const scope = await resolveBranchScope(user.branchId);
  return { programId: scope?.programId ?? null, branchId: user.branchId };
}

/**
 * Admin-only query flags (`include_inactive`, `with_counts`) expose rows and
 * pending-review numbers that browse deliberately hides, so they are refused
 * for anyone who is not a manager.
 */
export function assertIsManager(user: AuthUser | undefined): AuthUser {
  if (!user || !MANAGER_ROLES.includes(user.role)) {
    throw new ApiError(403, "FORBIDDEN", "Your role is not permitted to use the administrative view");
  }
  return user;
}
