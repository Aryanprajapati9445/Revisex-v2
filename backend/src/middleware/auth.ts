import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/apiError.js";
import { verifyAccessToken } from "../lib/jwt.js";
import type { UserRole } from "../types/index.js";

export interface AuthUser {
  id: string;
  role: UserRole;
  programId: string | null;
  branchId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function fromHeader(req: Request): AuthUser | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length);
  const payload = verifyAccessToken(token);
  return { id: payload.sub, role: payload.role, programId: payload.program_id, branchId: payload.branch_id };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const user = fromHeader(req);
    if (!user) {
      next(new ApiError(401, "UNAUTHENTICATED", "Missing or malformed Authorization header"));
      return;
    }
    req.user = user;
    next();
  } catch {
    next(new ApiError(401, "UNAUTHENTICATED", "Invalid or expired access token"));
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const user = fromHeader(req);
    if (user) req.user = user;
  } catch {
    // Invalid/expired token on a route that also serves anonymous users:
    // proceed unauthenticated rather than failing the request.
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new ApiError(401, "UNAUTHENTICATED", "Authentication required"));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ApiError(403, "FORBIDDEN", "Your role is not permitted to perform this action"));
      return;
    }
    next();
  };
}

export interface ResourceScope {
  programId: string | null;
  branchId: string | null;
}

export function requireScope(resolveScope: (req: Request) => Promise<ResourceScope | null>) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      next(new ApiError(401, "UNAUTHENTICATED", "Authentication required"));
      return;
    }
    try {
      const scope = await resolveScope(req);
      if (!scope) {
        next(new ApiError(404, "NOT_FOUND", "Resource not found"));
        return;
      }

      const { role, programId, branchId } = req.user;
      const inScope =
        role === "superuser" ||
        (role === "program_admin" && scope.programId === programId) ||
        (role === "branch_admin" && scope.branchId === branchId) ||
        (role === "student" && scope.branchId === branchId);

      // A mismatched scope must not reveal that the resource exists, so it
      // gets the same 404 as a genuinely missing one.
      if (!inScope) {
        next(new ApiError(404, "NOT_FOUND", "Resource not found"));
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
