import { eq, and, asc, desc, sql, isNull, lt } from "drizzle-orm";
import { getDb } from "../db/connection.js";
import { threads, todos } from "../db/schema/threads.js";

/**
 * List todos in a thread.
 */
export async function listTodos(threadId: string) {
  return getDb()
    .select({
      id: todos.id,
      content: todos.content,
      position: todos.position,
      completed_at: todos.completed_at,
      created_at: todos.created_at,
    })
    .from(todos)
    .where(eq(todos.thread_id, threadId))
    .orderBy(asc(todos.position));
}

/**
 * Create a todo in a thread. Auto-assigns position.
 */
export async function createTodo(params: {
  thread_id: string;
  content: string;
}) {
  return getDb().transaction(async (tx) => {
    const [maxRow] = await tx
      .select({
        max_pos: sql<number>`COALESCE(MAX(${todos.position}), -1)`.as("max_pos"),
      })
      .from(todos)
      .where(eq(todos.thread_id, params.thread_id));

    const position = Number(maxRow.max_pos) + 1;

    const [todo] = await tx
      .insert(todos)
      .values({
        thread_id: params.thread_id,
        content: params.content,
        position,
      })
      .returning({
        id: todos.id,
        content: todos.content,
        position: todos.position,
        completed_at: todos.completed_at,
        created_at: todos.created_at,
      });

    await tx
      .update(threads)
      .set({ updated_at: new Date() })
      .where(eq(threads.id, params.thread_id));

    return todo;
  });
}

/**
 * Get a todo by ID (includes thread_id for ownership check).
 */
export async function getTodoById(todoId: string) {
  const [row] = await getDb()
    .select({
      id: todos.id,
      thread_id: todos.thread_id,
      content: todos.content,
      position: todos.position,
      completed_at: todos.completed_at,
      created_at: todos.created_at,
      updated_at: todos.updated_at,
    })
    .from(todos)
    .where(eq(todos.id, todoId))
    .limit(1);
  return row ?? null;
}

/**
 * Update a todo (content and/or completed).
 */
export async function updateTodo(
  todoId: string,
  params: { content?: string; completed?: boolean },
) {
  return getDb().transaction(async (tx) => {
    // Get current state for idempotent completed toggle
    const [current] = await tx
      .select({
        completed_at: todos.completed_at,
        thread_id: todos.thread_id,
      })
      .from(todos)
      .where(eq(todos.id, todoId))
      .limit(1);

    if (!current) return null;

    const updates: Record<string, unknown> = { updated_at: new Date() };

    if (params.content !== undefined) {
      updates.content = params.content;
    }

    if (params.completed === true && current.completed_at === null) {
      updates.completed_at = new Date();
    } else if (params.completed === false && current.completed_at !== null) {
      updates.completed_at = null;
    }

    const [todo] = await tx
      .update(todos)
      .set(updates)
      .where(eq(todos.id, todoId))
      .returning({
        id: todos.id,
        content: todos.content,
        position: todos.position,
        completed_at: todos.completed_at,
        created_at: todos.created_at,
        updated_at: todos.updated_at,
      });

    await tx
      .update(threads)
      .set({ updated_at: new Date() })
      .where(eq(threads.id, current.thread_id));

    return todo;
  });
}

/**
 * Delete a todo.
 */
export async function deleteTodo(todoId: string): Promise<{ thread_id: string } | null> {
  return getDb().transaction(async (tx) => {
    const [deleted] = await tx
      .delete(todos)
      .where(eq(todos.id, todoId))
      .returning({ thread_id: todos.thread_id });

    if (!deleted) return null;

    await tx
      .update(threads)
      .set({ updated_at: new Date() })
      .where(eq(threads.id, deleted.thread_id));

    return deleted;
  });
}

/**
 * Cross-thread todo list (e.g. incomplete todos across all threads).
 */
export async function listCrossThreadTodos(params: {
  user_id: string;
  completed: boolean;
  cursor?: string;
  limit: number;
}) {
  const conditions = [eq(threads.user_id, params.user_id)];

  if (params.completed) {
    conditions.push(sql`${todos.completed_at} IS NOT NULL`);
  } else {
    conditions.push(isNull(todos.completed_at));
  }

  if (params.cursor) {
    conditions.push(lt(todos.created_at, new Date(params.cursor)));
  }

  const rows = await getDb()
    .select({
      id: todos.id,
      content: todos.content,
      completed_at: todos.completed_at,
      created_at: todos.created_at,
      thread_id: threads.id,
      thread_title: threads.title,
    })
    .from(todos)
    .innerJoin(threads, eq(todos.thread_id, threads.id))
    .where(and(...conditions))
    .orderBy(desc(todos.created_at))
    .limit(params.limit + 1);

  const hasMore = rows.length > params.limit;
  const items = hasMore ? rows.slice(0, params.limit) : rows;
  const next_cursor = hasMore
    ? items[items.length - 1].created_at?.toISOString() ?? null
    : null;

  const result = items.map((r) => ({
    id: r.id,
    content: r.content,
    completed_at: r.completed_at,
    created_at: r.created_at,
    thread: {
      id: r.thread_id,
      title: r.thread_title,
    },
  }));

  return { todos: result, next_cursor };
}
