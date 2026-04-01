import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { getDb, getClient_UNSAFE } from "../../db/connection.js";
import { users, workspaces } from "../../db/schema/auth.js";
import { threads, todos } from "../../db/schema/threads.js";
import {
  listTodos,
  createTodo,
  getTodoById,
  updateTodo,
  deleteTodo,
  listCrossThreadTodos,
} from "../../services/todos.js";

let testUser: { id: string };
let testThread: { id: string };

beforeEach(async () => {
  await getDb().execute(
    sql`TRUNCATE threads, thread_tags, tags, bookmarks, todos, messages, user_cohorts, cohorts, workspaces, users CASCADE`,
  );

  const [user] = await getDb()
    .insert(users)
    .values({ email: "student@test.com", display_name: "Student", external_auth_id: "uid-student" })
    .returning();
  testUser = user;

  const [ws] = await getDb().insert(workspaces).values({ type: "cohort", name: "Q1" }).returning();

  const [thread] = await getDb()
    .insert(threads)
    .values({ user_id: testUser.id, workspace_id: ws.id, title: "Test Thread" })
    .returning();
  testThread = thread;
});

afterAll(async () => {
  await getClient_UNSAFE().end();
});

describe("todos service", () => {
  describe("createTodo", () => {
    it("creates a todo with position 0", async () => {
      const todo = await createTodo({ thread_id: testThread.id, content: "First" });

      expect(todo.content).toBe("First");
      expect(todo.position).toBe(0);
      expect(todo.completed_at).toBeNull();
    });

    it("auto-increments position", async () => {
      await createTodo({ thread_id: testThread.id, content: "First" });
      const second = await createTodo({ thread_id: testThread.id, content: "Second" });

      expect(second.position).toBe(1);
    });
  });

  describe("getTodoById", () => {
    it("returns todo with thread_id", async () => {
      const created = await createTodo({ thread_id: testThread.id, content: "Hello" });
      const todo = await getTodoById(created.id);

      expect(todo).not.toBeNull();
      expect(todo!.thread_id).toBe(testThread.id);
    });

    it("returns null for nonexistent todo", async () => {
      const todo = await getTodoById("00000000-0000-0000-0000-000000000000");
      expect(todo).toBeNull();
    });
  });

  describe("updateTodo", () => {
    it("updates content", async () => {
      const created = await createTodo({ thread_id: testThread.id, content: "Original" });
      const updated = await updateTodo(created.id, { content: "Updated" });

      expect(updated!.content).toBe("Updated");
    });

    it("completes a todo", async () => {
      const created = await createTodo({ thread_id: testThread.id, content: "Do this" });
      const updated = await updateTodo(created.id, { completed: true });

      expect(updated!.completed_at).not.toBeNull();
    });

    it("uncompletes a todo", async () => {
      const created = await createTodo({ thread_id: testThread.id, content: "Do this" });
      await updateTodo(created.id, { completed: true });
      const updated = await updateTodo(created.id, { completed: false });

      expect(updated!.completed_at).toBeNull();
    });

    it("is idempotent when already completed", async () => {
      const created = await createTodo({ thread_id: testThread.id, content: "Do this" });
      const first = await updateTodo(created.id, { completed: true });
      const second = await updateTodo(created.id, { completed: true });

      // completed_at should not change
      expect(first!.completed_at!.toISOString()).toBe(second!.completed_at!.toISOString());
    });

    it("returns null for nonexistent todo", async () => {
      const result = await updateTodo("00000000-0000-0000-0000-000000000000", { content: "X" });
      expect(result).toBeNull();
    });
  });

  describe("deleteTodo", () => {
    it("deletes todo and returns thread_id", async () => {
      const created = await createTodo({ thread_id: testThread.id, content: "Delete me" });
      const result = await deleteTodo(created.id);

      expect(result).not.toBeNull();
      expect(result!.thread_id).toBe(testThread.id);

      const check = await getTodoById(created.id);
      expect(check).toBeNull();
    });

    it("returns null for nonexistent todo", async () => {
      const result = await deleteTodo("00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });
  });

  describe("listTodos", () => {
    it("returns todos in position order", async () => {
      await createTodo({ thread_id: testThread.id, content: "First" });
      await createTodo({ thread_id: testThread.id, content: "Second" });

      const items = await listTodos(testThread.id);

      expect(items).toHaveLength(2);
      expect(items[0].content).toBe("First");
      expect(items[1].content).toBe("Second");
    });
  });

  describe("listCrossThreadTodos", () => {
    it("returns incomplete todos across threads", async () => {
      const [ws] = await getDb()
        .insert(workspaces)
        .values({ type: "cohort", name: "Q2" })
        .returning();
      const [thread2] = await getDb()
        .insert(threads)
        .values({ user_id: testUser.id, workspace_id: ws.id, title: "Thread 2" })
        .returning();

      await createTodo({ thread_id: testThread.id, content: "Todo 1" });
      await createTodo({ thread_id: thread2.id, content: "Todo 2" });
      const completed = await createTodo({ thread_id: testThread.id, content: "Done" });
      await updateTodo(completed.id, { completed: true });

      const result = await listCrossThreadTodos({
        user_id: testUser.id,
        completed: false,
        limit: 50,
      });

      expect(result.todos).toHaveLength(2);
      expect(result.todos[0].thread).toBeDefined();
      expect(result.todos[0].thread.title).toBeDefined();
    });

    it("does not return other user's todos", async () => {
      const [other] = await getDb()
        .insert(users)
        .values({ email: "other@test.com", display_name: "Other", external_auth_id: "uid-other" })
        .returning();
      const [ws] = await getDb()
        .insert(workspaces)
        .values({ type: "cohort", name: "Other WS" })
        .returning();
      const [otherThread] = await getDb()
        .insert(threads)
        .values({ user_id: other.id, workspace_id: ws.id, title: "Other Thread" })
        .returning();

      await createTodo({ thread_id: testThread.id, content: "Mine" });
      await getDb().insert(todos).values({
        thread_id: otherThread.id,
        content: "Not mine",
        position: 0,
      });

      const result = await listCrossThreadTodos({
        user_id: testUser.id,
        completed: false,
        limit: 50,
      });

      expect(result.todos).toHaveLength(1);
      expect(result.todos[0].content).toBe("Mine");
    });

    it("paginates with cursor", async () => {
      await createTodo({ thread_id: testThread.id, content: "Todo 1" });
      await createTodo({ thread_id: testThread.id, content: "Todo 2" });
      await createTodo({ thread_id: testThread.id, content: "Todo 3" });

      const first = await listCrossThreadTodos({
        user_id: testUser.id,
        completed: false,
        limit: 2,
      });

      expect(first.todos).toHaveLength(2);
      expect(first.next_cursor).not.toBeNull();

      const second = await listCrossThreadTodos({
        user_id: testUser.id,
        completed: false,
        cursor: first.next_cursor!,
        limit: 2,
      });

      expect(second.todos).toHaveLength(1);
      expect(second.next_cursor).toBeNull();
    });
  });
});
