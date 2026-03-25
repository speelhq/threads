import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getDb, getClient_UNSAFE } from "../../db/connection.js";
import { users, workspaces } from "../../db/schema/auth.js";
import { threads } from "../../db/schema/threads.js";
import {
  listBookmarks,
  createBookmark,
  getBookmarkById,
  updateBookmark,
  deleteBookmark,
  InvalidUrlError,
} from "../../services/bookmarks.js";
import { isUrlSafe } from "../../services/ogp.js";

let testUser: { id: string };
let testThread: { id: string };

// Mock fetch for OGP tests
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  await getDb().execute(
    sql`TRUNCATE threads, thread_tags, tags, bookmarks, todos, messages, user_cohorts, cohorts, workspaces, users CASCADE`,
  );

  const [user] = await getDb()
    .insert(users)
    .values({ email: "student@test.com", display_name: "Student", external_auth_id: "uid-student" })
    .returning();
  testUser = user;

  const [ws] = await getDb()
    .insert(workspaces)
    .values({ type: "cohort", name: "Q1" })
    .returning();

  const [thread] = await getDb()
    .insert(threads)
    .values({ user_id: testUser.id, workspace_id: ws.id, title: "Test Thread" })
    .returning();
  testThread = thread;

  // Mock fetch to avoid real HTTP requests
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    text: () => Promise.resolve('<html><head><meta property="og:title" content="Test Title"><meta property="og:description" content="Test Desc"></head></html>'),
  }) as unknown as typeof fetch;
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  await getClient_UNSAFE().end();
});

describe("bookmarks service", () => {
  describe("createBookmark", () => {
    it("creates a bookmark with OGP data", async () => {
      const bookmark = await createBookmark({
        thread_id: testThread.id,
        url: "https://example.com/page",
      });

      expect(bookmark.url).toBe("https://example.com/page");
      expect(bookmark.domain).toBe("example.com");
      expect(bookmark.title).toBe("Test Title");
      expect(bookmark.description).toBe("Test Desc");
      expect(bookmark.position).toBe(0);
    });

    it("auto-increments position", async () => {
      await createBookmark({ thread_id: testThread.id, url: "https://example.com/1" });
      const second = await createBookmark({ thread_id: testThread.id, url: "https://example.com/2" });

      expect(second.position).toBe(1);
    });

    it("handles OGP fetch failure gracefully", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as unknown as typeof fetch;

      const bookmark = await createBookmark({
        thread_id: testThread.id,
        url: "https://example.com/fail",
      });

      expect(bookmark.title).toBeNull();
      expect(bookmark.description).toBeNull();
      expect(bookmark.domain).toBe("example.com");
    });

    it("throws InvalidUrlError for unsafe URL", async () => {
      await expect(
        createBookmark({
          thread_id: testThread.id,
          url: "http://169.254.169.254/metadata",
        }),
      ).rejects.toThrow(InvalidUrlError);
    });
  });

  describe("getBookmarkById", () => {
    it("returns bookmark with thread_id", async () => {
      const created = await createBookmark({
        thread_id: testThread.id,
        url: "https://example.com",
      });
      const bookmark = await getBookmarkById(created.id);

      expect(bookmark).not.toBeNull();
      expect(bookmark!.thread_id).toBe(testThread.id);
    });

    it("returns null for nonexistent bookmark", async () => {
      const bookmark = await getBookmarkById("00000000-0000-0000-0000-000000000000");
      expect(bookmark).toBeNull();
    });
  });

  describe("updateBookmark", () => {
    it("updates title", async () => {
      const created = await createBookmark({
        thread_id: testThread.id,
        url: "https://example.com",
      });
      const updated = await updateBookmark(created.id, { title: "New Title" });

      expect(updated!.title).toBe("New Title");
      expect(updated!.url).toBe("https://example.com");
    });

    it("clears title with empty string", async () => {
      const created = await createBookmark({
        thread_id: testThread.id,
        url: "https://example.com",
      });
      const updated = await updateBookmark(created.id, { title: "" });

      expect(updated!.title).toBe("");
    });

    it("returns null for nonexistent bookmark", async () => {
      const result = await updateBookmark("00000000-0000-0000-0000-000000000000", { title: "X" });
      expect(result).toBeNull();
    });
  });

  describe("deleteBookmark", () => {
    it("deletes bookmark and returns thread_id", async () => {
      const created = await createBookmark({
        thread_id: testThread.id,
        url: "https://example.com",
      });
      const result = await deleteBookmark(created.id);

      expect(result).not.toBeNull();
      expect(result!.thread_id).toBe(testThread.id);

      const check = await getBookmarkById(created.id);
      expect(check).toBeNull();
    });

    it("returns null for nonexistent bookmark", async () => {
      const result = await deleteBookmark("00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });
  });

  describe("listBookmarks", () => {
    it("returns bookmarks in position order", async () => {
      await createBookmark({ thread_id: testThread.id, url: "https://example.com/1" });
      await createBookmark({ thread_id: testThread.id, url: "https://example.com/2" });

      const items = await listBookmarks(testThread.id);

      expect(items).toHaveLength(2);
      expect(items[0].position).toBe(0);
      expect(items[1].position).toBe(1);
    });
  });
});

describe("isUrlSafe", () => {
  it("allows https URLs", () => {
    expect(isUrlSafe("https://example.com")).toBe(true);
  });

  it("allows http URLs", () => {
    expect(isUrlSafe("http://example.com")).toBe(true);
  });

  it("blocks ftp URLs", () => {
    expect(isUrlSafe("ftp://example.com")).toBe(false);
  });

  it("blocks localhost", () => {
    expect(isUrlSafe("http://localhost")).toBe(false);
  });

  it("blocks loopback IP", () => {
    expect(isUrlSafe("http://127.0.0.1")).toBe(false);
  });

  it("blocks private IP 10.x", () => {
    expect(isUrlSafe("http://10.0.0.1")).toBe(false);
  });

  it("blocks private IP 172.16.x", () => {
    expect(isUrlSafe("http://172.16.0.1")).toBe(false);
  });

  it("blocks private IP 192.168.x", () => {
    expect(isUrlSafe("http://192.168.1.1")).toBe(false);
  });

  it("blocks GCP metadata server", () => {
    expect(isUrlSafe("http://169.254.169.254")).toBe(false);
  });

  it("blocks invalid URLs", () => {
    expect(isUrlSafe("not-a-url")).toBe(false);
  });
});
