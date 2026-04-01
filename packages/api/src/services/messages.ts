import { eq, and, asc, sql, gt } from "drizzle-orm";
import { getDb } from "../db/connection.js";
import { threads, messages } from "../db/schema/threads.js";

/**
 * List messages in a thread with cursor pagination.
 */
export async function listMessages(params: { thread_id: string; cursor?: string; limit: number }) {
  const conditions = [eq(messages.thread_id, params.thread_id)];

  if (params.cursor) {
    conditions.push(gt(messages.position, Number(params.cursor)));
  }

  const rows = await getDb()
    .select({
      id: messages.id,
      body: messages.body,
      position: messages.position,
      created_at: messages.created_at,
      updated_at: messages.updated_at,
    })
    .from(messages)
    .where(and(...conditions))
    .orderBy(asc(messages.position))
    .limit(params.limit + 1);

  const hasMore = rows.length > params.limit;
  const items = hasMore ? rows.slice(0, params.limit) : rows;
  const next_cursor = hasMore ? String(items[items.length - 1].position) : null;

  return { messages: items, next_cursor };
}

/**
 * Create a message in a thread. Auto-assigns position.
 */
export async function createMessage(params: { thread_id: string; body: string }) {
  return getDb().transaction(async (tx) => {
    // Get next position
    const [maxRow] = await tx
      .select({
        max_pos: sql<number>`COALESCE(MAX(${messages.position}), -1)`.as("max_pos"),
      })
      .from(messages)
      .where(eq(messages.thread_id, params.thread_id));

    const position = Number(maxRow.max_pos) + 1;

    const [message] = await tx
      .insert(messages)
      .values({
        thread_id: params.thread_id,
        body: params.body,
        position,
      })
      .returning({
        id: messages.id,
        body: messages.body,
        position: messages.position,
        created_at: messages.created_at,
        updated_at: messages.updated_at,
      });

    // Update thread's updated_at
    await tx
      .update(threads)
      .set({ updated_at: new Date() })
      .where(eq(threads.id, params.thread_id));

    return message;
  });
}

/**
 * Get a message by ID (includes thread_id for ownership check).
 */
export async function getMessageById(messageId: string) {
  const [row] = await getDb()
    .select({
      id: messages.id,
      thread_id: messages.thread_id,
      body: messages.body,
      position: messages.position,
      created_at: messages.created_at,
      updated_at: messages.updated_at,
    })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  return row ?? null;
}

/**
 * Update a message's body.
 */
export async function updateMessage(messageId: string, params: { body: string }) {
  return getDb().transaction(async (tx) => {
    const [message] = await tx
      .update(messages)
      .set({ body: params.body, updated_at: new Date() })
      .where(eq(messages.id, messageId))
      .returning({
        id: messages.id,
        thread_id: messages.thread_id,
        body: messages.body,
        position: messages.position,
        created_at: messages.created_at,
        updated_at: messages.updated_at,
      });

    if (!message) return null;

    // Update thread's updated_at
    await tx
      .update(threads)
      .set({ updated_at: new Date() })
      .where(eq(threads.id, message.thread_id));

    return message;
  });
}

/**
 * Delete a message.
 */
export async function deleteMessage(messageId: string): Promise<{ thread_id: string } | null> {
  return getDb().transaction(async (tx) => {
    const [deleted] = await tx
      .delete(messages)
      .where(eq(messages.id, messageId))
      .returning({ thread_id: messages.thread_id });

    if (!deleted) return null;

    // Update thread's updated_at
    await tx
      .update(threads)
      .set({ updated_at: new Date() })
      .where(eq(threads.id, deleted.thread_id));

    return deleted;
  });
}

/**
 * Reorder messages in a thread.
 */
export async function reorderMessages(threadId: string, messageIds: string[]) {
  return getDb().transaction(async (tx) => {
    // Verify all message_ids belong to this thread
    const existing = await tx
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.thread_id, threadId));

    const existingIds = new Set(existing.map((r) => r.id));

    // Check for IDs not in this thread
    const invalid = messageIds.filter((id) => !existingIds.has(id));
    if (invalid.length > 0) {
      throw new InvalidMessageIdsError();
    }

    // Check that all messages are covered
    if (messageIds.length !== existing.length) {
      throw new IncompleteMessageIdsError();
    }

    // Re-assign positions
    const result: { id: string; position: number }[] = [];
    for (let i = 0; i < messageIds.length; i++) {
      const [row] = await tx
        .update(messages)
        .set({ position: i, updated_at: new Date() })
        .where(eq(messages.id, messageIds[i]))
        .returning({ id: messages.id, position: messages.position });
      result.push(row);
    }

    // Update thread's updated_at
    await tx.update(threads).set({ updated_at: new Date() }).where(eq(threads.id, threadId));

    return result;
  });
}

export class InvalidMessageIdsError extends Error {
  constructor() {
    super("Invalid message IDs");
    this.name = "InvalidMessageIdsError";
  }
}

export class IncompleteMessageIdsError extends Error {
  constructor() {
    super("Incomplete message IDs");
    this.name = "IncompleteMessageIdsError";
  }
}
