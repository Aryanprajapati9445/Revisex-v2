import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../../middleware/errorHandler.js";
import * as programsService from "./programs.service.js";

const idParamSchema = z.string().uuid();

export async function listPrograms(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await programsService.listActivePrograms();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getProgram(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedId = idParamSchema.safeParse(req.params.id);
    if (!parsedId.success) throw new HttpError(400, "Program id must be a UUID");
    const id = parsedId.data;

    const data = await programsService.getProgramById(id);
    if (!data) throw new HttpError(404, `Program ${id} not found`);

    res.json({ data });
  } catch (err) {
    next(err);
  }
}
