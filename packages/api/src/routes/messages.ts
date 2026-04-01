import { Router, type Router as RouterType } from "express";
import { z } from "zod/v4";
import { verifyToken, resolveUser, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { sendValidationError } from "../middleware/validate.js";
import { getThreadOwnerId } from "../services/threads.js";
import {
  listMessages,
  createMessage,
  getMessageById,
  updateMessage,
  deleteMessage,
  reorderMessages,
  InvalidMessageIdsError,
  IncompleteMessageIdsError,
} from "../services/messages.js";
import { param } from "./helpers.js";

const createMessageSchema = z.object({
  body: z.string().trim().min(1).max(50000),
});

const updateMessageSchema = z.object({
  body: z.string().trim().min(1).max(50000),
});

const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

const reorderSchema = z.object({
  message_ids: z.array(z.uuid()).min(1),
});

// ── Thread-scoped routes (mounted at /threads) ──

export const threadMessageRoutes: RouterType = Router();

// GET /threads/:id/messages
threadMessageRoutes.get("/:id/messages", verifyToken, resolveUser, async (req, res) => {
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

  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const result = await listMessages({
    thread_id: threadId,
    cursor: parsed.data.cursor,
    limit: parsed.data.limit,
  });

  res.json(result);
});

// POST /threads/:id/messages
threadMessageRoutes.post("/:id/messages", verifyToken, resolveUser, async (req, res) => {
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

  const parsed = createMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const message = await createMessage({
    thread_id: threadId,
    body: parsed.data.body,
  });

  res.status(201).json(message);
});

// PATCH /threads/:id/messages/reorder
threadMessageRoutes.patch("/:id/messages/reorder", verifyToken, resolveUser, async (req, res) => {
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

  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const result = await reorderMessages(threadId, parsed.data.message_ids);
    res.json({ messages: result });
  } catch (err) {
    if (err instanceof InvalidMessageIdsError) {
      res.status(400).json({
        error: {
          code: "INVALID_MESSAGE_IDS",
          message: "Some message IDs do not belong to this thread",
        },
      });
      return;
    }
    if (err instanceof IncompleteMessageIdsError) {
      res.status(400).json({
        error: {
          code: "INCOMPLETE_MESSAGE_IDS",
          message: "All messages in the thread must be included",
        },
      });
      return;
    }
    throw err;
  }
});

// ── Top-level routes (mounted at /messages) ──

export const messageRoutes: RouterType = Router();

// PATCH /messages/:id
messageRoutes.patch("/:id", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;
  const messageId = param(req, "id");

  const existing = await getMessageById(messageId);
  if (!existing) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Message not found" },
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

  const parsed = updateMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const updated = await updateMessage(messageId, parsed.data);
  if (!updated) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Message not found" },
    });
    return;
  }

  // Return without thread_id (spec response format)
  const { thread_id: _, ...response } = updated;
  res.json(response);
});

// DELETE /messages/:id
messageRoutes.delete("/:id", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;
  const messageId = param(req, "id");

  const existing = await getMessageById(messageId);
  if (!existing) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Message not found" },
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

  await deleteMessage(messageId);
  res.status(204).send();
});
