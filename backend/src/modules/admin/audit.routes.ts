import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import * as controller from "./audit.controller.js";

export const auditRouter = Router();

auditRouter.use(requireAuth);
auditRouter.get("/", requirePermission("audit.read"), controller.listAuditLog);
