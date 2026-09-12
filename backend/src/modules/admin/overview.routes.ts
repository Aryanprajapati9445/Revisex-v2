import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../../lib/apiError.js";
import { sendSuccess } from "../../lib/response.js";
import { resolveActorScope } from "../../lib/taxonomyAccess.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { getOverview } from "./overview.service.js";

export const overviewRouter = Router();

/**
 * Gated by requireRole, not requirePermission, unlike its neighbours under
 * /api/admin. The dashboard reports on the content tree (programs, branches,
 * notes), which is the domain-role axis; the RBAC permission catalog covers the
 * account/role/audit surface and has no scope dimension to narrow these numbers
 * by. See middleware/permissions.ts for the distinction.
 */
overviewRouter.get(
  "/",
  requireAuth,
  requireRole("superuser", "program_admin", "branch_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
      sendSuccess(res, await getOverview(await resolveActorScope(req.user)));
    } catch (err) {
      next(err);
    }
  }
);
