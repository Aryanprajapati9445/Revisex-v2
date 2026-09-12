import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import * as controller from "./bookmarks.controller.js";

export const bookmarksRouter = Router();

// Every route is personal — a bookmark belongs to the caller and there is no
// surface for reading anyone else's — so the whole router requires auth rather
// than each handler re-checking.
bookmarksRouter.use(requireAuth);

bookmarksRouter.get("/", controller.listBookmarks);
bookmarksRouter.put("/:noteId", controller.addBookmark);
bookmarksRouter.delete("/:noteId", controller.removeBookmark);
