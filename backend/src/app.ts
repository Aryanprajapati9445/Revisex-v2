import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./config/env.js";
import { checkDbConnection } from "./config/db.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";

import { authRouter } from "./modules/auth/auth.routes.js";
import { programsRouter } from "./modules/programs/programs.routes.js";
import { branchesRouter } from "./modules/branches/branches.routes.js";
import { subjectsRouter } from "./modules/subjects/subjects.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { notesRouter } from "./modules/notes/notes.routes.js";
import { filesRouter } from "./modules/files/files.routes.js";
import { tagsRouter } from "./modules/tags/tags.routes.js";
import { bookmarksRouter } from "./modules/bookmarks/bookmarks.routes.js";
import { ratingsRouter } from "./modules/ratings/ratings.routes.js";
import { commentsRouter } from "./modules/comments/comments.routes.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());
  if (env.NODE_ENV !== "test") {
    app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));
  }

  // Liveness: the process is up. Does not touch the database.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Readiness: the process is up AND can reach Postgres.
  app.get("/health/db", async (_req, res) => {
    const dbOk = await checkDbConnection();
    res.status(dbOk ? 200 : 503).json({ status: dbOk ? "ok" : "unreachable" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/programs", programsRouter);
  app.use("/api/branches", branchesRouter);
  app.use("/api/subjects", subjectsRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/notes", notesRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/tags", tagsRouter);
  app.use("/api/bookmarks", bookmarksRouter);
  app.use("/api/ratings", ratingsRouter);
  app.use("/api/comments", commentsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
