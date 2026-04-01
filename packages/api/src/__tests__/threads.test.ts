import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import { mockFirebaseToken, resetFirebaseMocks } from "./helpers.js";

vi.mock("../services/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/auth.js")>();
  return {
    ...actual,
    findUserByExternalId: vi.fn(),
  };
});

vi.mock("../services/cohorts.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/cohorts.js")>();
  return {
    ...actual,
    listCohorts: vi.fn(),
    createCohort: vi.fn(),
    getCohortById: vi.fn(),
    updateCohort: vi.fn(),
    listMembers: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
    isInstructorOfCohort: vi.fn(),
  };
});

vi.mock("../services/threads.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/threads.js")>();
  return {
    ...actual,
    listThreads: vi.fn(),
    createThread: vi.fn(),
    getThreadById: vi.fn(),
    getThreadOwnerId: vi.fn(),
    updateThread: vi.fn(),
    deleteThread: vi.fn(),
    resolveWorkspaceId: vi.fn(),
  };
});

import { findUserByExternalId } from "../services/auth.js";
import {
  listThreads,
  createThread,
  getThreadById,
  getThreadOwnerId,
  updateThread,
  deleteThread,
  resolveWorkspaceId,
  InvalidTagError,
} from "../services/threads.js";

const mockFindUser = findUserByExternalId as ReturnType<typeof vi.fn>;
const mockListThreads = listThreads as ReturnType<typeof vi.fn>;
const mockCreateThread = createThread as ReturnType<typeof vi.fn>;
const mockGetThreadById = getThreadById as ReturnType<typeof vi.fn>;
const mockGetThreadOwnerId = getThreadOwnerId as ReturnType<typeof vi.fn>;
const mockUpdateThread = updateThread as ReturnType<typeof vi.fn>;
const mockDeleteThread = deleteThread as ReturnType<typeof vi.fn>;
const mockResolveWorkspaceId = resolveWorkspaceId as ReturnType<typeof vi.fn>;

const studentUser = {
  id: "user-1",
  email: "student@example.com",
  display_name: "Student",
  role: "member" as const,
};

const otherUser = {
  id: "user-2",
  email: "other@example.com",
  display_name: "Other",
  role: "member" as const,
};

const sampleThread = {
  id: "thread-1",
  title: "My Thread",
  workspace_id: "ws-1",
  pinned_at: null,
  tags: [],
  incomplete_todo_count: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const sampleThreadDetail = {
  ...sampleThread,
  messages: [],
  todos: [],
  bookmarks: [],
};

function authenticateAs(user: typeof studentUser) {
  mockFirebaseToken("uid-1", user.email);
  mockFindUser.mockResolvedValue(user);
}

describe("Thread endpoints", () => {
  beforeEach(() => {
    resetFirebaseMocks();
    mockFindUser.mockReset();
    mockListThreads.mockReset();
    mockCreateThread.mockReset();
    mockGetThreadById.mockReset();
    mockGetThreadOwnerId.mockReset();
    mockUpdateThread.mockReset();
    mockDeleteThread.mockReset();
    mockResolveWorkspaceId.mockReset();
  });

  // ── GET /threads ──

  describe("GET /threads", () => {
    it("returns thread list", async () => {
      authenticateAs(studentUser);
      mockListThreads.mockResolvedValue({ threads: [sampleThread], next_cursor: null });

      const res = await request(app).get("/threads").set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.threads).toHaveLength(1);
      expect(res.body.threads[0].title).toBe("My Thread");
      expect(res.body.next_cursor).toBeNull();
    });

    it("returns 401 without auth", async () => {
      const res = await request(app).get("/threads");
      expect(res.status).toBe(401);
    });

    it("passes query parameters to service", async () => {
      authenticateAs(studentUser);
      mockListThreads.mockResolvedValue({ threads: [], next_cursor: null });

      await request(app)
        .get("/threads?search=hello&limit=10")
        .set("Authorization", "Bearer valid-token");

      expect(mockListThreads).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-1",
          search: "hello",
          limit: 10,
        }),
      );
    });

    it("returns 400 for invalid limit", async () => {
      authenticateAs(studentUser);

      const res = await request(app)
        .get("/threads?limit=999")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ── POST /threads ──

  describe("POST /threads", () => {
    it("creates a thread", async () => {
      authenticateAs(studentUser);
      mockResolveWorkspaceId.mockResolvedValue("ws-1");
      mockCreateThread.mockResolvedValue(sampleThread);

      const res = await request(app)
        .post("/threads")
        .set("Authorization", "Bearer valid-token")
        .send({ title: "My Thread" });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe("My Thread");
      expect(res.body.workspace_id).toBe("ws-1");
    });

    it("returns 400 when no active cohort", async () => {
      authenticateAs(studentUser);
      mockResolveWorkspaceId.mockResolvedValue(null);

      const res = await request(app)
        .post("/threads")
        .set("Authorization", "Bearer valid-token")
        .send({ title: "Test" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("NO_ACTIVE_COHORT");
    });

    it("returns 400 for empty title", async () => {
      authenticateAs(studentUser);

      const res = await request(app)
        .post("/threads")
        .set("Authorization", "Bearer valid-token")
        .send({ title: "" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for title over 200 chars", async () => {
      authenticateAs(studentUser);

      const res = await request(app)
        .post("/threads")
        .set("Authorization", "Bearer valid-token")
        .send({ title: "a".repeat(201) });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for invalid tag_ids", async () => {
      authenticateAs(studentUser);
      mockResolveWorkspaceId.mockResolvedValue("ws-1");
      const fakeId = "a0000000-0000-4000-8000-000000000099";
      mockCreateThread.mockRejectedValue(new InvalidTagError([fakeId]));

      const res = await request(app)
        .post("/threads")
        .set("Authorization", "Bearer valid-token")
        .send({ title: "Test", tag_ids: [fakeId] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_TAG");
    });
  });

  // ── GET /threads/:id ──

  describe("GET /threads/:id", () => {
    it("returns thread detail for owner", async () => {
      authenticateAs(studentUser);
      mockGetThreadById.mockResolvedValue(sampleThreadDetail);
      mockGetThreadOwnerId.mockResolvedValue("user-1");

      const res = await request(app)
        .get("/threads/thread-1")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("thread-1");
      expect(res.body.messages).toEqual([]);
      expect(res.body.todos).toEqual([]);
      expect(res.body.bookmarks).toEqual([]);
    });

    it("returns 404 when not found", async () => {
      authenticateAs(studentUser);
      mockGetThreadOwnerId.mockResolvedValue(null);

      const res = await request(app)
        .get("/threads/nonexistent")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("returns 403 for non-owner", async () => {
      authenticateAs(studentUser);
      mockGetThreadOwnerId.mockResolvedValue("user-2");

      const res = await request(app)
        .get("/threads/thread-1")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  // ── PATCH /threads/:id ──

  describe("PATCH /threads/:id", () => {
    it("updates thread title", async () => {
      authenticateAs(studentUser);
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockUpdateThread.mockResolvedValue({ ...sampleThread, title: "Updated" });

      const res = await request(app)
        .patch("/threads/thread-1")
        .set("Authorization", "Bearer valid-token")
        .send({ title: "Updated" });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Updated");
    });

    it("pins a thread", async () => {
      authenticateAs(studentUser);
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockUpdateThread.mockResolvedValue({
        ...sampleThread,
        pinned_at: "2026-03-25T00:00:00.000Z",
      });

      const res = await request(app)
        .patch("/threads/thread-1")
        .set("Authorization", "Bearer valid-token")
        .send({ pinned: true });

      expect(res.status).toBe(200);
      expect(res.body.pinned_at).not.toBeNull();
    });

    it("returns 404 when not found", async () => {
      authenticateAs(studentUser);
      mockGetThreadOwnerId.mockResolvedValue(null);

      const res = await request(app)
        .patch("/threads/nonexistent")
        .set("Authorization", "Bearer valid-token")
        .send({ title: "X" });

      expect(res.status).toBe(404);
    });

    it("returns 403 for non-owner", async () => {
      authenticateAs(studentUser);
      mockGetThreadOwnerId.mockResolvedValue("user-2");

      const res = await request(app)
        .patch("/threads/thread-1")
        .set("Authorization", "Bearer valid-token")
        .send({ title: "X" });

      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid title", async () => {
      authenticateAs(studentUser);

      const res = await request(app)
        .patch("/threads/thread-1")
        .set("Authorization", "Bearer valid-token")
        .send({ title: "" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ── DELETE /threads/:id ──

  describe("DELETE /threads/:id", () => {
    it("deletes a thread", async () => {
      authenticateAs(studentUser);
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockDeleteThread.mockResolvedValue(true);

      const res = await request(app)
        .delete("/threads/thread-1")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(204);
    });

    it("returns 404 when not found", async () => {
      authenticateAs(studentUser);
      mockGetThreadOwnerId.mockResolvedValue(null);

      const res = await request(app)
        .delete("/threads/nonexistent")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("returns 403 for non-owner", async () => {
      authenticateAs(studentUser);
      mockGetThreadOwnerId.mockResolvedValue("user-2");

      const res = await request(app)
        .delete("/threads/thread-1")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });
  });
});
