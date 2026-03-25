import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import {
  mockFirebaseToken,
  resetFirebaseMocks,
} from "./helpers.js";

vi.mock("../services/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/auth.js")>();
  return { ...actual, findUserByExternalId: vi.fn() };
});

vi.mock("../services/cohorts.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/cohorts.js")>();
  return {
    ...actual,
    listCohorts: vi.fn(), createCohort: vi.fn(), getCohortById: vi.fn(),
    updateCohort: vi.fn(), listMembers: vi.fn(), addMember: vi.fn(),
    removeMember: vi.fn(), isInstructorOfCohort: vi.fn(),
  };
});

vi.mock("../services/threads.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/threads.js")>();
  return {
    ...actual,
    listThreads: vi.fn(), createThread: vi.fn(), getThreadById: vi.fn(),
    getThreadOwnerId: vi.fn(), updateThread: vi.fn(), deleteThread: vi.fn(),
    resolveWorkspaceId: vi.fn(),
  };
});

vi.mock("../services/messages.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/messages.js")>();
  return {
    ...actual,
    listMessages: vi.fn(), createMessage: vi.fn(), getMessageById: vi.fn(),
    updateMessage: vi.fn(), deleteMessage: vi.fn(), reorderMessages: vi.fn(),
  };
});

vi.mock("../services/todos.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/todos.js")>();
  return {
    ...actual,
    listTodos: vi.fn(), createTodo: vi.fn(), getTodoById: vi.fn(),
    updateTodo: vi.fn(), deleteTodo: vi.fn(), listCrossThreadTodos: vi.fn(),
  };
});

import { findUserByExternalId } from "../services/auth.js";
import { getThreadOwnerId } from "../services/threads.js";
import {
  listTodos, createTodo, getTodoById, updateTodo, deleteTodo, listCrossThreadTodos,
} from "../services/todos.js";

const mockFindUser = findUserByExternalId as ReturnType<typeof vi.fn>;
const mockGetThreadOwnerId = getThreadOwnerId as ReturnType<typeof vi.fn>;
const mockListTodos = listTodos as ReturnType<typeof vi.fn>;
const mockCreateTodo = createTodo as ReturnType<typeof vi.fn>;
const mockGetTodoById = getTodoById as ReturnType<typeof vi.fn>;
const mockUpdateTodo = updateTodo as ReturnType<typeof vi.fn>;
const mockDeleteTodo = deleteTodo as ReturnType<typeof vi.fn>;
const mockListCrossThreadTodos = listCrossThreadTodos as ReturnType<typeof vi.fn>;

const user = {
  id: "user-1",
  email: "student@example.com",
  display_name: "Student",
  role: "member" as const,
};

const sampleTodo = {
  id: "todo-1",
  content: "Do this",
  position: 0,
  completed_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

function authenticate() {
  mockFirebaseToken("uid-1", user.email);
  mockFindUser.mockResolvedValue(user);
}

describe("Todo endpoints", () => {
  beforeEach(() => {
    resetFirebaseMocks();
    mockFindUser.mockReset();
    mockGetThreadOwnerId.mockReset();
    mockListTodos.mockReset();
    mockCreateTodo.mockReset();
    mockGetTodoById.mockReset();
    mockUpdateTodo.mockReset();
    mockDeleteTodo.mockReset();
    mockListCrossThreadTodos.mockReset();
  });

  // ── GET /threads/:id/todos ──

  describe("GET /threads/:id/todos", () => {
    it("returns todo list", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockListTodos.mockResolvedValue([sampleTodo]);

      const res = await request(app)
        .get("/threads/thread-1/todos")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.todos).toHaveLength(1);
    });

    it("returns 404 when thread not found", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue(null);

      const res = await request(app)
        .get("/threads/nonexistent/todos")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("returns 403 for non-owner", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue("user-2");

      const res = await request(app)
        .get("/threads/thread-1/todos")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });
  });

  // ── POST /threads/:id/todos ──

  describe("POST /threads/:id/todos", () => {
    it("creates a todo", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockCreateTodo.mockResolvedValue(sampleTodo);

      const res = await request(app)
        .post("/threads/thread-1/todos")
        .set("Authorization", "Bearer valid-token")
        .send({ content: "Do this" });

      expect(res.status).toBe(201);
      expect(res.body.content).toBe("Do this");
    });

    it("returns 400 for empty content", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue("user-1");

      const res = await request(app)
        .post("/threads/thread-1/todos")
        .set("Authorization", "Bearer valid-token")
        .send({ content: "" });

      expect(res.status).toBe(400);
    });

    it("returns 400 for content over 1000 chars", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue("user-1");

      const res = await request(app)
        .post("/threads/thread-1/todos")
        .set("Authorization", "Bearer valid-token")
        .send({ content: "a".repeat(1001) });

      expect(res.status).toBe(400);
    });
  });

  // ── PATCH /todos/:id ──

  describe("PATCH /todos/:id", () => {
    it("updates content", async () => {
      authenticate();
      mockGetTodoById.mockResolvedValue({ ...sampleTodo, thread_id: "thread-1", updated_at: "2026-01-01T00:00:00.000Z" });
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockUpdateTodo.mockResolvedValue({ ...sampleTodo, content: "Updated", updated_at: "2026-01-01T00:00:00.000Z" });

      const res = await request(app)
        .patch("/todos/todo-1")
        .set("Authorization", "Bearer valid-token")
        .send({ content: "Updated" });

      expect(res.status).toBe(200);
      expect(res.body.content).toBe("Updated");
    });

    it("toggles completed", async () => {
      authenticate();
      mockGetTodoById.mockResolvedValue({ ...sampleTodo, thread_id: "thread-1", updated_at: "2026-01-01T00:00:00.000Z" });
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockUpdateTodo.mockResolvedValue({ ...sampleTodo, completed_at: "2026-03-25T00:00:00.000Z", updated_at: "2026-03-25T00:00:00.000Z" });

      const res = await request(app)
        .patch("/todos/todo-1")
        .set("Authorization", "Bearer valid-token")
        .send({ completed: true });

      expect(res.status).toBe(200);
      expect(res.body.completed_at).not.toBeNull();
    });

    it("returns 404 when todo not found", async () => {
      authenticate();
      mockGetTodoById.mockResolvedValue(null);

      const res = await request(app)
        .patch("/todos/nonexistent")
        .set("Authorization", "Bearer valid-token")
        .send({ content: "X" });

      expect(res.status).toBe(404);
    });

    it("returns 403 for non-owner", async () => {
      authenticate();
      mockGetTodoById.mockResolvedValue({ ...sampleTodo, thread_id: "thread-1", updated_at: "2026-01-01T00:00:00.000Z" });
      mockGetThreadOwnerId.mockResolvedValue("user-2");

      const res = await request(app)
        .patch("/todos/todo-1")
        .set("Authorization", "Bearer valid-token")
        .send({ content: "X" });

      expect(res.status).toBe(403);
    });
  });

  // ── DELETE /todos/:id ──

  describe("DELETE /todos/:id", () => {
    it("deletes a todo", async () => {
      authenticate();
      mockGetTodoById.mockResolvedValue({ ...sampleTodo, thread_id: "thread-1", updated_at: "2026-01-01T00:00:00.000Z" });
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockDeleteTodo.mockResolvedValue({ thread_id: "thread-1" });

      const res = await request(app)
        .delete("/todos/todo-1")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(204);
    });

    it("returns 404 when todo not found", async () => {
      authenticate();
      mockGetTodoById.mockResolvedValue(null);

      const res = await request(app)
        .delete("/todos/nonexistent")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });
  });

  // ── GET /todos?completed=false ──

  describe("GET /todos?completed=false", () => {
    it("returns cross-thread todos", async () => {
      authenticate();
      mockListCrossThreadTodos.mockResolvedValue({
        todos: [{ ...sampleTodo, thread: { id: "thread-1", title: "My Thread" } }],
        next_cursor: null,
      });

      const res = await request(app)
        .get("/todos?completed=false")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.todos).toHaveLength(1);
      expect(res.body.todos[0].thread.title).toBe("My Thread");
    });

    it("returns 400 without completed param", async () => {
      authenticate();

      const res = await request(app)
        .get("/todos")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(400);
    });
  });
});
