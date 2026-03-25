import { Router, type Router as RouterType } from "express";
import { z } from "zod/v4";
import {
  verifyToken,
  resolveUser,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";
import { sendValidationError } from "../middleware/validate.js";
import { getThreadOwnerId } from "../services/threads.js";
import {
  listTags,
  createCustomTag,
  createPresetTag,
  getTagById,
  updateTag,
  deleteTag,
  addTagToThread,
  removeTagFromThread,
  TagAlreadyExistsError,
  InvalidTagError,
  AlreadyTaggedError,
  CohortNotFoundError,
  ForbiddenError,
} from "../services/tags.js";

function param(req: { params: Record<string, string | string[]> }, key: string): string {
  const val = req.params[key];
  return Array.isArray(val) ? val[0] : val;
}

const listTagsQuerySchema = z.object({
  cohort_id: z.uuid(),
});

const createCustomTagSchema = z.object({
  name: z.string().trim().min(1).max(50),
});

const createPresetTagSchema = z.object({
  name: z.string().trim().min(1).max(50),
  cohort_id: z.uuid().nullable().optional(),
});

const updateTagSchema = z.object({
  name: z.string().trim().min(1).max(50),
});

const addThreadTagSchema = z.object({
  tag_id: z.uuid(),
});

// ── Tag CRUD routes (mounted at /tags) ──

export const tagRoutes: RouterType = Router();

// GET /tags?cohort_id=xxx
tagRoutes.get("/", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;

  const parsed = listTagsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const items = await listTags({
    cohort_id: parsed.data.cohort_id,
    user_id: user.id,
  });

  res.json({ tags: items });
});

// POST /tags
tagRoutes.post("/", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;

  const parsed = createCustomTagSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const tag = await createCustomTag({
      name: parsed.data.name,
      user_id: user.id,
    });
    res.status(201).json(tag);
  } catch (err) {
    if (err instanceof TagAlreadyExistsError) {
      res.status(409).json({
        error: { code: "TAG_ALREADY_EXISTS", message: "Tag with this name already exists" },
      });
      return;
    }
    throw err;
  }
});

// POST /tags/preset
tagRoutes.post("/preset", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;

  const parsed = createPresetTagSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const tag = await createPresetTag({
      name: parsed.data.name,
      cohort_id: parsed.data.cohort_id ?? null,
      user_id: user.id,
      user_role: user.role,
    });
    res.status(201).json(tag);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "Access denied" },
      });
      return;
    }
    if (err instanceof CohortNotFoundError) {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "Cohort not found" },
      });
      return;
    }
    if (err instanceof TagAlreadyExistsError) {
      res.status(409).json({
        error: { code: "TAG_ALREADY_EXISTS", message: "Preset tag with this name already exists in this scope" },
      });
      return;
    }
    throw err;
  }
});

// PATCH /tags/:id
tagRoutes.patch("/:id", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;
  const tagId = param(req, "id");

  const existing = await getTagById(tagId);
  if (!existing) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Tag not found" },
    });
    return;
  }

  if (existing.created_by !== user.id) {
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "Access denied" },
    });
    return;
  }

  const parsed = updateTagSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const updated = await updateTag(tagId, parsed.data);
    if (!updated) {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "Tag not found" },
      });
      return;
    }
    res.json(updated);
  } catch (err) {
    if (err instanceof TagAlreadyExistsError) {
      res.status(409).json({
        error: { code: "TAG_ALREADY_EXISTS", message: "Tag with this name already exists" },
      });
      return;
    }
    throw err;
  }
});

// DELETE /tags/:id
tagRoutes.delete("/:id", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;
  const tagId = param(req, "id");

  const existing = await getTagById(tagId);
  if (!existing) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Tag not found" },
    });
    return;
  }

  if (existing.created_by !== user.id) {
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "Access denied" },
    });
    return;
  }

  await deleteTag(tagId);
  res.status(204).send();
});

// ── Thread-tag routes (mounted at /threads) ──

export const threadTagRoutes: RouterType = Router();

// POST /threads/:id/tags
threadTagRoutes.post("/:id/tags", verifyToken, resolveUser, async (req, res) => {
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

  const parsed = addThreadTagSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const result = await addTagToThread({
      thread_id: threadId,
      tag_id: parsed.data.tag_id,
      user_id: user.id,
    });
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof InvalidTagError) {
      res.status(400).json({
        error: { code: "INVALID_TAG", message: "Tag not found or not accessible" },
      });
      return;
    }
    if (err instanceof AlreadyTaggedError) {
      res.status(409).json({
        error: { code: "ALREADY_TAGGED", message: "Tag already assigned to this thread" },
      });
      return;
    }
    throw err;
  }
});

// DELETE /threads/:id/tags/:tag_id
threadTagRoutes.delete("/:id/tags/:tag_id", verifyToken, resolveUser, async (req, res) => {
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

  const removed = await removeTagFromThread(threadId, param(req, "tag_id"));
  if (!removed) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Tag not assigned to this thread" },
    });
    return;
  }

  res.status(204).send();
});
