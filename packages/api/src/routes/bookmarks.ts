import { Router, type Router as RouterType } from "express";
import { z } from "zod/v4";
import { verifyToken, resolveUser, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { sendValidationError } from "../middleware/validate.js";
import { getThreadOwnerId } from "../services/threads.js";
import {
  listBookmarks,
  createBookmark,
  getBookmarkById,
  updateBookmark,
  deleteBookmark,
  InvalidUrlError,
} from "../services/bookmarks.js";
import { param } from "./helpers.js";

const createBookmarkSchema = z.object({
  url: z.url(),
});

const updateBookmarkSchema = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
});

// ── Thread-scoped routes (mounted at /threads) ──

export const threadBookmarkRoutes: RouterType = Router();

// GET /threads/:id/bookmarks
threadBookmarkRoutes.get("/:id/bookmarks", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;
  const threadId = param(req, "id");

  const ownerId = await getThreadOwnerId(threadId);
  if (!ownerId) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Thread not found" },
    });
    return;
  }
  if (ownerId !== user.id) {
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "Access denied" },
    });
    return;
  }

  const items = await listBookmarks(threadId);
  res.json({ bookmarks: items });
});

// POST /threads/:id/bookmarks
threadBookmarkRoutes.post("/:id/bookmarks", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;
  const threadId = param(req, "id");

  const ownerId = await getThreadOwnerId(threadId);
  if (!ownerId) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Thread not found" },
    });
    return;
  }
  if (ownerId !== user.id) {
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "Access denied" },
    });
    return;
  }

  const parsed = createBookmarkSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const bookmark = await createBookmark({
      thread_id: threadId,
      url: parsed.data.url,
    });
    res.status(201).json(bookmark);
  } catch (err) {
    if (err instanceof InvalidUrlError) {
      res.status(400).json({
        error: { code: "INVALID_URL", message: "Invalid or unsafe URL" },
      });
      return;
    }
    throw err;
  }
});

// ── Top-level routes (mounted at /bookmarks) ──

export const bookmarkRoutes: RouterType = Router();

// PATCH /bookmarks/:id
bookmarkRoutes.patch("/:id", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;
  const bookmarkId = param(req, "id");

  const existing = await getBookmarkById(bookmarkId);
  if (!existing) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Bookmark not found" },
    });
    return;
  }

  const ownerId = await getThreadOwnerId(existing.thread_id);
  if (ownerId !== user.id) {
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "Access denied" },
    });
    return;
  }

  const parsed = updateBookmarkSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const updated = await updateBookmark(bookmarkId, parsed.data);
  if (!updated) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Bookmark not found" },
    });
    return;
  }

  const { thread_id: _, ...response } = updated;
  res.json(response);
});

// DELETE /bookmarks/:id
bookmarkRoutes.delete("/:id", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;
  const bookmarkId = param(req, "id");

  const existing = await getBookmarkById(bookmarkId);
  if (!existing) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Bookmark not found" },
    });
    return;
  }

  const ownerId = await getThreadOwnerId(existing.thread_id);
  if (ownerId !== user.id) {
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "Access denied" },
    });
    return;
  }

  await deleteBookmark(bookmarkId);
  res.status(204).send();
});
