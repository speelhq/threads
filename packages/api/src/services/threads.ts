import { eq, and, desc, asc, sql, lt, isNull } from "drizzle-orm";
import { getDb } from "../db/connection.js";
import { threads, messages, todos, bookmarks, tags, threadTags } from "../db/schema/threads.js";
import { userCohorts, cohorts } from "../db/schema/auth.js";

/**
 * Resolve the workspace_id for a student user.
 * Picks the cohort where they are a student, most recently joined.
 */
export async function resolveWorkspaceId(userId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ workspace_id: cohorts.workspace_id })
    .from(userCohorts)
    .innerJoin(cohorts, eq(userCohorts.cohort_id, cohorts.id))
    .where(
      and(
        eq(userCohorts.user_id, userId),
        eq(userCohorts.role_in_cohort, "student"),
      ),
    )
    .orderBy(desc(userCohorts.created_at))
    .limit(1);
  return row?.workspace_id ?? null;
}

/**
 * List threads for a user with tags & incomplete_todo_count.
 */
export async function listThreads(params: {
  user_id: string;
  tag_id?: string;
  search?: string;
  cursor?: string;
  limit: number;
}) {
  const conditions = [eq(threads.user_id, params.user_id)];

  if (params.search) {
    const escaped = params.search.replace(/[%_\\]/g, "\\$&");
    conditions.push(sql`${threads.title} ILIKE ${"%" + escaped + "%"} ESCAPE '\\'`);
  }

  if (params.cursor) {
    conditions.push(lt(threads.updated_at, new Date(params.cursor)));
  }

  // If filtering by tag, join thread_tags
  let baseQuery;
  if (params.tag_id) {
    baseQuery = getDb()
      .select({
        id: threads.id,
        title: threads.title,
        pinned_at: threads.pinned_at,
        created_at: threads.created_at,
        updated_at: threads.updated_at,
        incomplete_todo_count:
          sql<number>`(SELECT COUNT(*) FROM todos WHERE thread_id = ${threads.id} AND completed_at IS NULL)`.as(
            "incomplete_todo_count",
          ),
      })
      .from(threads)
      .innerJoin(threadTags, eq(threads.id, threadTags.thread_id))
      .where(and(...conditions, eq(threadTags.tag_id, params.tag_id)));
  } else {
    baseQuery = getDb()
      .select({
        id: threads.id,
        title: threads.title,
        pinned_at: threads.pinned_at,
        created_at: threads.created_at,
        updated_at: threads.updated_at,
        incomplete_todo_count:
          sql<number>`(SELECT COUNT(*) FROM todos WHERE thread_id = ${threads.id} AND completed_at IS NULL)`.as(
            "incomplete_todo_count",
          ),
      })
      .from(threads)
      .where(and(...conditions));
  }

  const rows = await baseQuery
    .orderBy(
      sql`pinned_at DESC NULLS LAST`,
      desc(threads.updated_at),
    )
    .limit(params.limit + 1);

  const hasMore = rows.length > params.limit;
  const items = hasMore ? rows.slice(0, params.limit) : rows;

  // Fetch tags for all threads in one query
  const threadIds = items.map((r) => r.id);
  let tagMap: Record<string, { id: string; name: string; type: string }[]> = {};
  if (threadIds.length > 0) {
    const tagRows = await getDb()
      .select({
        thread_id: threadTags.thread_id,
        id: tags.id,
        name: tags.name,
        type: tags.type,
      })
      .from(threadTags)
      .innerJoin(tags, eq(threadTags.tag_id, tags.id))
      .where(
        sql`${threadTags.thread_id} IN ${threadIds}`,
      );

    for (const tr of tagRows) {
      if (!tagMap[tr.thread_id]) tagMap[tr.thread_id] = [];
      tagMap[tr.thread_id].push({ id: tr.id, name: tr.name, type: tr.type });
    }
  }

  const threadsWithTags = items.map((t) => ({
    ...t,
    tags: tagMap[t.id] ?? [],
  }));

  const next_cursor = hasMore
    ? items[items.length - 1].updated_at?.toISOString() ?? null
    : null;

  return { threads: threadsWithTags, next_cursor };
}

/**
 * Create a thread with optional tag_ids.
 */
export async function createThread(params: {
  user_id: string;
  workspace_id: string;
  title: string;
  tag_ids?: string[];
}) {
  return getDb().transaction(async (tx) => {
    const [thread] = await tx
      .insert(threads)
      .values({
        user_id: params.user_id,
        workspace_id: params.workspace_id,
        title: params.title,
      })
      .returning({
        id: threads.id,
        title: threads.title,
        workspace_id: threads.workspace_id,
        pinned_at: threads.pinned_at,
        created_at: threads.created_at,
        updated_at: threads.updated_at,
      });

    if (params.tag_ids && params.tag_ids.length > 0) {
      // Validate: tags must exist AND be accessible (preset or own custom)
      const accessibleTags = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(
          and(
            sql`${tags.id} IN ${params.tag_ids}`,
            sql`(${tags.type} = 'preset' OR ${tags.created_by} = ${params.user_id})`,
          ),
        );

      if (accessibleTags.length !== params.tag_ids.length) {
        const accessibleIds = new Set(accessibleTags.map((t) => t.id));
        const invalidIds = params.tag_ids.filter((id) => !accessibleIds.has(id));
        throw new InvalidTagError(invalidIds);
      }

      await tx.insert(threadTags).values(
        params.tag_ids.map((tag_id) => ({
          thread_id: thread.id,
          tag_id,
        })),
      );
    }

    // Fetch inserted tags for response
    let threadTags_: { id: string; name: string; type: string }[] = [];
    if (params.tag_ids && params.tag_ids.length > 0) {
      threadTags_ = await tx
        .select({ id: tags.id, name: tags.name, type: tags.type })
        .from(tags)
        .where(sql`${tags.id} IN ${params.tag_ids}`);
    }

    return {
      ...thread,
      tags: threadTags_,
      incomplete_todo_count: 0,
    };
  });
}

/**
 * Get thread detail with messages, todos, bookmarks, tags.
 */
export async function getThreadById(threadId: string) {
  const [thread] = await getDb()
    .select()
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1);

  if (!thread) return null;

  const [threadMessages, threadTodos, threadBookmarks, threadTagRows] =
    await Promise.all([
      getDb()
        .select({
          id: messages.id,
          body: messages.body,
          position: messages.position,
          created_at: messages.created_at,
          updated_at: messages.updated_at,
        })
        .from(messages)
        .where(eq(messages.thread_id, threadId))
        .orderBy(asc(messages.position)),
      getDb()
        .select({
          id: todos.id,
          content: todos.content,
          position: todos.position,
          completed_at: todos.completed_at,
          created_at: todos.created_at,
        })
        .from(todos)
        .where(eq(todos.thread_id, threadId))
        .orderBy(asc(todos.position)),
      getDb()
        .select({
          id: bookmarks.id,
          url: bookmarks.url,
          title: bookmarks.title,
          description: bookmarks.description,
          domain: bookmarks.domain,
          position: bookmarks.position,
          created_at: bookmarks.created_at,
        })
        .from(bookmarks)
        .where(eq(bookmarks.thread_id, threadId))
        .orderBy(asc(bookmarks.position)),
      getDb()
        .select({
          id: tags.id,
          name: tags.name,
          type: tags.type,
        })
        .from(threadTags)
        .innerJoin(tags, eq(threadTags.tag_id, tags.id))
        .where(eq(threadTags.thread_id, threadId)),
    ]);

  return {
    id: thread.id,
    title: thread.title,
    workspace_id: thread.workspace_id,
    pinned_at: thread.pinned_at,
    tags: threadTagRows,
    messages: threadMessages,
    todos: threadTodos,
    bookmarks: threadBookmarks,
    created_at: thread.created_at,
    updated_at: thread.updated_at,
  };
}

/**
 * Get thread owner_id for ownership check.
 */
export async function getThreadOwnerId(threadId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ user_id: threads.user_id })
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1);
  return row?.user_id ?? null;
}

/**
 * Update thread (title, pinned).
 */
export async function updateThread(
  threadId: string,
  params: { title?: string; pinned?: boolean },
) {
  const updates: Record<string, unknown> = { updated_at: new Date() };

  if (params.title !== undefined) {
    updates.title = params.title;
  }

  if (params.pinned === true) {
    updates.pinned_at = new Date();
  } else if (params.pinned === false) {
    updates.pinned_at = null;
  }

  const [row] = await getDb()
    .update(threads)
    .set(updates)
    .where(eq(threads.id, threadId))
    .returning({
      id: threads.id,
      title: threads.title,
      workspace_id: threads.workspace_id,
      pinned_at: threads.pinned_at,
      created_at: threads.created_at,
      updated_at: threads.updated_at,
    });

  if (!row) return null;

  // Fetch tags and incomplete_todo_count
  const [threadTagRows, todoCountRows] = await Promise.all([
    getDb()
      .select({ id: tags.id, name: tags.name, type: tags.type })
      .from(threadTags)
      .innerJoin(tags, eq(threadTags.tag_id, tags.id))
      .where(eq(threadTags.thread_id, threadId)),
    getDb()
      .select({
        count: sql<number>`COUNT(*)`.as("count"),
      })
      .from(todos)
      .where(and(eq(todos.thread_id, threadId), isNull(todos.completed_at))),
  ]);

  return {
    ...row,
    tags: threadTagRows,
    incomplete_todo_count: Number(todoCountRows[0]?.count ?? 0),
  };
}

/**
 * Delete a thread (cascade deletes messages, todos, bookmarks, thread_tags).
 */
export async function deleteThread(threadId: string): Promise<boolean> {
  const deleted = await getDb()
    .delete(threads)
    .where(eq(threads.id, threadId))
    .returning({ id: threads.id });
  return deleted.length > 0;
}

export class InvalidTagError extends Error {
  invalidIds: string[];
  constructor(invalidIds: string[]) {
    super("Invalid tag IDs");
    this.name = "InvalidTagError";
    this.invalidIds = invalidIds;
  }
}
