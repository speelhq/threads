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
  listTodos,
  createTodo,
  getTodoById,
  updateTodo,
  deleteTodo,
  listCrossThreadTodos,
} from "../services/todos.js";
import { param } from "./helpers.js";

const createTodoSchema = z.object({
  content: z.string().trim().min(1).max(1000),
});

const updateTodoSchema = z.object({
  content: z.string().trim().min(1).max(1000).optional(),
  completed: z.boolean().optional(),
});

const crossThreadQuerySchema = z.object({
  completed: z.enum(["true", "false"]),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

// ── Thread-scoped routes (mounted at /threads) ──

export const threadTodoRoutes: RouterType = Router();

// GET /threads/:id/todos
threadTodoRoutes.get("/:id/todos", verifyToken, resolveUser, async (req, res) => {
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

  const items = await listTodos(threadId);
  res.json({ todos: items });
});

// POST /threads/:id/todos
threadTodoRoutes.post("/:id/todos", verifyToken, resolveUser, async (req, res) => {
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

  const parsed = createTodoSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const todo = await createTodo({
    thread_id: threadId,
    content: parsed.data.content,
  });

  res.status(201).json(todo);
});

// ── Top-level routes (mounted at /todos) ──

export const todoRoutes: RouterType = Router();

// GET /todos?completed=false
todoRoutes.get("/", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;

  const parsed = crossThreadQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const result = await listCrossThreadTodos({
    user_id: user.id,
    completed: parsed.data.completed === "true",
    cursor: parsed.data.cursor,
    limit: parsed.data.limit,
  });

  res.json(result);
});

// PATCH /todos/:id
todoRoutes.patch("/:id", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;
  const todoId = param(req, "id");

  const existing = await getTodoById(todoId);
  if (!existing) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Todo not found" },
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

  const parsed = updateTodoSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const updated = await updateTodo(todoId, parsed.data);
  if (!updated) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Todo not found" },
    });
    return;
  }

  res.json(updated);
});

// DELETE /todos/:id
todoRoutes.delete("/:id", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;
  const todoId = param(req, "id");

  const existing = await getTodoById(todoId);
  if (!existing) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Todo not found" },
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

  await deleteTodo(todoId);
  res.status(204).send();
});
