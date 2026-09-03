import type { NextFunction, Request, Response } from "express";
import { pool } from "../config/db.js";
import { ApiError } from "../lib/apiError.js";
import type { PermissionId } from "../lib/permissions.js";

/**
 * Resolves a user's admin permissions fresh from the database on every call
 * — deliberately NOT read from the JWT (see middleware/auth.ts's AuthUser,
 * which carries the unrelated content-scope role/program/branch claims).
 * A permission change made through the admin UI must take effect on the
 * user's very next request, not on their next login/refresh; embedding it
 * in the access token would delay it up to the token's TTL instead.
 */
export async function getUserPermissions(userId: string): Promise<Set<string>> {
  const { rows } = await pool.query<{ permission_id: string }>(
    `SELECT DISTINCT rp.permission_id
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
      WHERE ur.user_id = $1`,
    [userId]
  );
  return new Set(rows.map((r) => r.permission_id));
}

/**
 * Gate for the /api/admin surface. Requires requireAuth to have already run
 * (it reads req.user.id, set there). This is the actual security boundary —
 * the frontend's permission-based show/hide is convenience only.
 */
export function requirePermission(permission: PermissionId) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      next(new ApiError(401, "UNAUTHENTICATED", "Authentication required"));
      return;
    }
    try {
      const granted = await getUserPermissions(req.user.id);
      if (!granted.has(permission)) {
        next(new ApiError(403, "FORBIDDEN", `Missing required permission: ${permission}`));
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
