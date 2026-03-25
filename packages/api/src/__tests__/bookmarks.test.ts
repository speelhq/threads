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

vi.mock("../services/bookmarks.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/bookmarks.js")>();
  return {
    ...actual,
    listBookmarks: vi.fn(), createBookmark: vi.fn(), getBookmarkById: vi.fn(),
    updateBookmark: vi.fn(), deleteBookmark: vi.fn(),
  };
});

import { findUserByExternalId } from "../services/auth.js";
import { getThreadOwnerId } from "../services/threads.js";
import {
  listBookmarks, createBookmark, getBookmarkById, updateBookmark, deleteBookmark,
  InvalidUrlError,
} from "../services/bookmarks.js";

const mockFindUser = findUserByExternalId as ReturnType<typeof vi.fn>;
const mockGetThreadOwnerId = getThreadOwnerId as ReturnType<typeof vi.fn>;
const mockListBookmarks = listBookmarks as ReturnType<typeof vi.fn>;
const mockCreateBookmark = createBookmark as ReturnType<typeof vi.fn>;
const mockGetBookmarkById = getBookmarkById as ReturnType<typeof vi.fn>;
const mockUpdateBookmark = updateBookmark as ReturnType<typeof vi.fn>;
const mockDeleteBookmark = deleteBookmark as ReturnType<typeof vi.fn>;

const user = {
  id: "user-1",
  email: "student@example.com",
  display_name: "Student",
  role: "member" as const,
};

const sampleBookmark = {
  id: "bm-1",
  url: "https://example.com",
  title: "Example",
  description: "An example site",
  domain: "example.com",
  position: 0,
  created_at: "2026-01-01T00:00:00.000Z",
};

function authenticate() {
  mockFirebaseToken("uid-1", user.email);
  mockFindUser.mockResolvedValue(user);
}

describe("Bookmark endpoints", () => {
  beforeEach(() => {
    resetFirebaseMocks();
    mockFindUser.mockReset();
    mockGetThreadOwnerId.mockReset();
    mockListBookmarks.mockReset();
    mockCreateBookmark.mockReset();
    mockGetBookmarkById.mockReset();
    mockUpdateBookmark.mockReset();
    mockDeleteBookmark.mockReset();
  });

  // ── GET /threads/:id/bookmarks ──

  describe("GET /threads/:id/bookmarks", () => {
    it("returns bookmark list", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockListBookmarks.mockResolvedValue([sampleBookmark]);

      const res = await request(app)
        .get("/threads/thread-1/bookmarks")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.bookmarks).toHaveLength(1);
      expect(res.body.bookmarks[0].domain).toBe("example.com");
    });

    it("returns 404 when thread not found", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue(null);

      const res = await request(app)
        .get("/threads/nonexistent/bookmarks")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("returns 403 for non-owner", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue("user-2");

      const res = await request(app)
        .get("/threads/thread-1/bookmarks")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });
  });

  // ── POST /threads/:id/bookmarks ──

  describe("POST /threads/:id/bookmarks", () => {
    it("creates a bookmark", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockCreateBookmark.mockResolvedValue(sampleBookmark);

      const res = await request(app)
        .post("/threads/thread-1/bookmarks")
        .set("Authorization", "Bearer valid-token")
        .send({ url: "https://example.com" });

      expect(res.status).toBe(201);
      expect(res.body.url).toBe("https://example.com");
    });

    it("returns 400 for invalid URL", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue("user-1");

      const res = await request(app)
        .post("/threads/thread-1/bookmarks")
        .set("Authorization", "Bearer valid-token")
        .send({ url: "not-a-url" });

      expect(res.status).toBe(400);
    });

    it("returns 400 for unsafe URL (SSRF)", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockCreateBookmark.mockRejectedValue(new InvalidUrlError());

      const res = await request(app)
        .post("/threads/thread-1/bookmarks")
        .set("Authorization", "Bearer valid-token")
        .send({ url: "http://169.254.169.254/metadata" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_URL");
    });

    it("returns 404 when thread not found", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue(null);

      const res = await request(app)
        .post("/threads/nonexistent/bookmarks")
        .set("Authorization", "Bearer valid-token")
        .send({ url: "https://example.com" });

      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /bookmarks/:id ──

  describe("PATCH /bookmarks/:id", () => {
    it("updates title", async () => {
      authenticate();
      mockGetBookmarkById.mockResolvedValue({ ...sampleBookmark, thread_id: "thread-1" });
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockUpdateBookmark.mockResolvedValue({ ...sampleBookmark, thread_id: "thread-1", title: "New Title" });

      const res = await request(app)
        .patch("/bookmarks/bm-1")
        .set("Authorization", "Bearer valid-token")
        .send({ title: "New Title" });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("New Title");
      expect(res.body.thread_id).toBeUndefined();
    });

    it("returns 404 when bookmark not found", async () => {
      authenticate();
      mockGetBookmarkById.mockResolvedValue(null);

      const res = await request(app)
        .patch("/bookmarks/nonexistent")
        .set("Authorization", "Bearer valid-token")
        .send({ title: "X" });

      expect(res.status).toBe(404);
    });

    it("returns 403 for non-owner", async () => {
      authenticate();
      mockGetBookmarkById.mockResolvedValue({ ...sampleBookmark, thread_id: "thread-1" });
      mockGetThreadOwnerId.mockResolvedValue("user-2");

      const res = await request(app)
        .patch("/bookmarks/bm-1")
        .set("Authorization", "Bearer valid-token")
        .send({ title: "X" });

      expect(res.status).toBe(403);
    });
  });

  // ── DELETE /bookmarks/:id ──

  describe("DELETE /bookmarks/:id", () => {
    it("deletes a bookmark", async () => {
      authenticate();
      mockGetBookmarkById.mockResolvedValue({ ...sampleBookmark, thread_id: "thread-1" });
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockDeleteBookmark.mockResolvedValue({ thread_id: "thread-1" });

      const res = await request(app)
        .delete("/bookmarks/bm-1")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(204);
    });

    it("returns 404 when bookmark not found", async () => {
      authenticate();
      mockGetBookmarkById.mockResolvedValue(null);

      const res = await request(app)
        .delete("/bookmarks/nonexistent")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("returns 403 for non-owner", async () => {
      authenticate();
      mockGetBookmarkById.mockResolvedValue({ ...sampleBookmark, thread_id: "thread-1" });
      mockGetThreadOwnerId.mockResolvedValue("user-2");

      const res = await request(app)
        .delete("/bookmarks/bm-1")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });
  });
});
