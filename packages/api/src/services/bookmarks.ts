import { eq, asc, sql } from "drizzle-orm";
import { getDb } from "../db/connection.js";
import { threads, bookmarks } from "../db/schema/threads.js";
import { fetchOgp, extractDomain, isUrlSafe } from "./ogp.js";

/**
 * List bookmarks in a thread.
 */
export async function listBookmarks(threadId: string) {
  return getDb()
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
    .orderBy(asc(bookmarks.position));
}

/**
 * Create a bookmark. Fetches OGP and extracts domain.
 */
export async function createBookmark(params: {
  thread_id: string;
  url: string;
}) {
  // Validate URL safety (SSRF prevention)
  if (!isUrlSafe(params.url)) {
    throw new InvalidUrlError();
  }

  const domain = extractDomain(params.url);
  const ogp = await fetchOgp(params.url);

  return getDb().transaction(async (tx) => {
    const [maxRow] = await tx
      .select({
        max_pos: sql<number>`COALESCE(MAX(${bookmarks.position}), -1)`.as("max_pos"),
      })
      .from(bookmarks)
      .where(eq(bookmarks.thread_id, params.thread_id));

    const position = Number(maxRow.max_pos) + 1;

    const [bookmark] = await tx
      .insert(bookmarks)
      .values({
        thread_id: params.thread_id,
        url: params.url,
        title: ogp.title,
        description: ogp.description,
        domain,
        position,
      })
      .returning({
        id: bookmarks.id,
        url: bookmarks.url,
        title: bookmarks.title,
        description: bookmarks.description,
        domain: bookmarks.domain,
        position: bookmarks.position,
        created_at: bookmarks.created_at,
      });

    await tx
      .update(threads)
      .set({ updated_at: new Date() })
      .where(eq(threads.id, params.thread_id));

    return bookmark;
  });
}

/**
 * Get a bookmark by ID (includes thread_id for ownership check).
 */
export async function getBookmarkById(bookmarkId: string) {
  const [row] = await getDb()
    .select({
      id: bookmarks.id,
      thread_id: bookmarks.thread_id,
      url: bookmarks.url,
      title: bookmarks.title,
      description: bookmarks.description,
      domain: bookmarks.domain,
      position: bookmarks.position,
      created_at: bookmarks.created_at,
    })
    .from(bookmarks)
    .where(eq(bookmarks.id, bookmarkId))
    .limit(1);
  return row ?? null;
}

/**
 * Update a bookmark (title, description only).
 */
export async function updateBookmark(
  bookmarkId: string,
  params: { title?: string; description?: string },
) {
  return getDb().transaction(async (tx) => {
    const [bookmark] = await tx
      .update(bookmarks)
      .set({ ...params, updated_at: new Date() })
      .where(eq(bookmarks.id, bookmarkId))
      .returning({
        id: bookmarks.id,
        thread_id: bookmarks.thread_id,
        url: bookmarks.url,
        title: bookmarks.title,
        description: bookmarks.description,
        domain: bookmarks.domain,
        position: bookmarks.position,
        created_at: bookmarks.created_at,
      });

    if (!bookmark) return null;

    await tx
      .update(threads)
      .set({ updated_at: new Date() })
      .where(eq(threads.id, bookmark.thread_id));

    return bookmark;
  });
}

/**
 * Delete a bookmark.
 */
export async function deleteBookmark(bookmarkId: string): Promise<{ thread_id: string } | null> {
  return getDb().transaction(async (tx) => {
    const [deleted] = await tx
      .delete(bookmarks)
      .where(eq(bookmarks.id, bookmarkId))
      .returning({ thread_id: bookmarks.thread_id });

    if (!deleted) return null;

    await tx
      .update(threads)
      .set({ updated_at: new Date() })
      .where(eq(threads.id, deleted.thread_id));

    return deleted;
  });
}

export class InvalidUrlError extends Error {
  constructor() {
    super("Invalid or unsafe URL");
    this.name = "InvalidUrlError";
  }
}
