import { Router, type Router as RouterType } from "express";
import { z } from "zod/v4";
import {
  verifyToken,
  resolveUser,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";
import { sendValidationError } from "../middleware/validate.js";
import {
  listThreads,
  createThread,
  getThreadById,
  getThreadOwnerId,
  updateThread,
  deleteThread,
  resolveWorkspaceId,
  InvalidTagError,
} from "../services/threads.js";

const router: RouterType = Router();

function param(req: { params: Record<string, string | string[]> }, key: string): string {
  const val = req.params[key];
  return Array.isArray(val) ? val[0] : val;
}

const createThreadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  tag_ids: z.array(z.uuid()).optional(),
});

const updateThreadSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  pinned: z.boolean().optional(),
});

const listQuerySchema = z.object({
  tag_id: z.uuid().optional(),
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

// GET /threads
router.get("/", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;

  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const result = await listThreads({
    user_id: user.id,
    tag_id: parsed.data.tag_id,
    search: parsed.data.search,
    cursor: parsed.data.cursor,
    limit: parsed.data.limit,
  });

  res.json(result);
});

// POST /threads
router.post("/", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;

  const parsed = createThreadSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const workspaceId = await resolveWorkspaceId(user.id);
  if (!workspaceId) {
    res.status(400).json({
      error: { code: "NO_ACTIVE_COHORT", message: "No active cohort found for student" },
    });
    return;
  }

  try {
    const thread = await createThread({
      user_id: user.id,
      workspace_id: workspaceId,
      title: parsed.data.title,
      tag_ids: parsed.data.tag_ids,
    });
    res.status(201).json(thread);
  } catch (err) {
    if (err instanceof InvalidTagError) {
      res.status(400).json({
        error: { code: "INVALID_TAG", message: "Invalid or inaccessible tag IDs" },
      });
      return;
    }
    throw err;
  }
});

// GET /threads/:id
router.get("/:id", verifyToken, resolveUser, async (req, res) => {
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

  const thread = await getThreadById(threadId);
  res.json(thread);
});

// PATCH /threads/:id
router.patch("/:id", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;
  const threadId = param(req, "id");

  const parsed = updateThreadSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

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

  const updated = await updateThread(threadId, parsed.data);
  if (!updated) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Thread not found" },
    });
    return;
  }

  res.json(updated);
});

// DELETE /threads/:id
router.delete("/:id", verifyToken, resolveUser, async (req, res) => {
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

  await deleteThread(threadId);
  res.status(204).send();
});

export default router;
