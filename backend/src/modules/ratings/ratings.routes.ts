import { Router } from "express";
import { optionalAuth, requireAuth } from "../../middleware/auth.js";
import * as controller from "./ratings.controller.js";

export const ratingsRouter = Router();

// Reading a score is public — an approved note's rating shows on the browse
// pages a signed-out visitor can already see. Casting one is not.
ratingsRouter.get("/:noteId", optionalAuth, controller.getRating);
ratingsRouter.put("/:noteId", requireAuth, controller.rateNote);
ratingsRouter.delete("/:noteId", requireAuth, controller.clearRating);
