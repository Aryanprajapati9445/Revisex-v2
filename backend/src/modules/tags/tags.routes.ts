import { Router } from "express";
import { z } from "zod";
import { sendSuccess } from "../../lib/response.js";
import * as service from "./tags.service.js";

export const tagsRouter = Router();

const listQuerySchema = z.object({
  q: z.string().trim().min(1).max(50).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// Public: tags label approved notes, which anyone can already browse.
tagsRouter.get("/", async (req, res, next) => {
  try {
    const { q, limit } = listQuerySchema.parse(req.query);
    sendSuccess(res, await service.listTags(q, limit));
  } catch (err) {
    next(err);
  }
});
