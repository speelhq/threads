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

vi.mock("../services/tags.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/tags.js")>();
  return {
    ...actual,
    listTags: vi.fn(), createCustomTag: vi.fn(), createPresetTag: vi.fn(),
    getTagById: vi.fn(), updateTag: vi.fn(), deleteTag: vi.fn(),
    addTagToThread: vi.fn(), removeTagFromThread: vi.fn(),
  };
});

import { findUserByExternalId } from "../services/auth.js";
import { getThreadOwnerId } from "../services/threads.js";
import {
  listTags, createCustomTag, createPresetTag, getTagById, updateTag, deleteTag,
  addTagToThread, removeTagFromThread,
  TagAlreadyExistsError, InvalidTagError, AlreadyTaggedError,
  CohortNotFoundError, ForbiddenError,
} from "../services/tags.js";

const mockFindUser = findUserByExternalId as ReturnType<typeof vi.fn>;
const mockGetThreadOwnerId = getThreadOwnerId as ReturnType<typeof vi.fn>;
const mockListTags = listTags as ReturnType<typeof vi.fn>;
const mockCreateCustomTag = createCustomTag as ReturnType<typeof vi.fn>;
const mockCreatePresetTag = createPresetTag as ReturnType<typeof vi.fn>;
const mockGetTagById = getTagById as ReturnType<typeof vi.fn>;
const mockUpdateTag = updateTag as ReturnType<typeof vi.fn>;
const mockDeleteTag = deleteTag as ReturnType<typeof vi.fn>;
const mockAddTagToThread = addTagToThread as ReturnType<typeof vi.fn>;
const mockRemoveTagFromThread = removeTagFromThread as ReturnType<typeof vi.fn>;

const memberUser = {
  id: "user-1",
  email: "student@example.com",
  display_name: "Student",
  role: "member" as const,
};

const adminUser = {
  id: "admin-1",
  email: "admin@example.com",
  display_name: "Admin",
  role: "admin" as const,
};

const sampleTag = {
  id: "tag-1",
  name: "JavaScript",
  type: "custom",
  cohort_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

const cohortId = "a0000000-0000-4000-8000-000000000001";
const tagId = "a0000000-0000-4000-8000-000000000002";

function authenticateAs(user: typeof memberUser | typeof adminUser) {
  mockFirebaseToken("uid-1", user.email);
  mockFindUser.mockResolvedValue(user);
}

describe("Tag endpoints", () => {
  beforeEach(() => {
    resetFirebaseMocks();
    mockFindUser.mockReset();
    mockGetThreadOwnerId.mockReset();
    mockListTags.mockReset();
    mockCreateCustomTag.mockReset();
    mockCreatePresetTag.mockReset();
    mockGetTagById.mockReset();
    mockUpdateTag.mockReset();
    mockDeleteTag.mockReset();
    mockAddTagToThread.mockReset();
    mockRemoveTagFromThread.mockReset();
  });

  // ── GET /tags ──

  describe("GET /tags", () => {
    it("returns tag list", async () => {
      authenticateAs(memberUser);
      mockListTags.mockResolvedValue([sampleTag]);

      const res = await request(app)
        .get(`/tags?cohort_id=${cohortId}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.tags).toHaveLength(1);
    });

    it("returns 400 without cohort_id", async () => {
      authenticateAs(memberUser);

      const res = await request(app)
        .get("/tags")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(400);
    });
  });

  // ── POST /tags ──

  describe("POST /tags", () => {
    it("creates a custom tag", async () => {
      authenticateAs(memberUser);
      mockCreateCustomTag.mockResolvedValue(sampleTag);

      const res = await request(app)
        .post("/tags")
        .set("Authorization", "Bearer valid-token")
        .send({ name: "JavaScript" });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe("JavaScript");
    });

    it("returns 409 for duplicate name", async () => {
      authenticateAs(memberUser);
      mockCreateCustomTag.mockRejectedValue(new TagAlreadyExistsError());

      const res = await request(app)
        .post("/tags")
        .set("Authorization", "Bearer valid-token")
        .send({ name: "JavaScript" });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("TAG_ALREADY_EXISTS");
    });

    it("returns 400 for empty name", async () => {
      authenticateAs(memberUser);

      const res = await request(app)
        .post("/tags")
        .set("Authorization", "Bearer valid-token")
        .send({ name: "" });

      expect(res.status).toBe(400);
    });
  });

  // ── POST /tags/preset ──

  describe("POST /tags/preset", () => {
    it("creates a preset tag as admin", async () => {
      authenticateAs(adminUser);
      mockCreatePresetTag.mockResolvedValue({ ...sampleTag, type: "preset" });

      const res = await request(app)
        .post("/tags/preset")
        .set("Authorization", "Bearer valid-token")
        .send({ name: "Variables", cohort_id: cohortId });

      expect(res.status).toBe(201);
    });

    it("returns 403 for non-admin/non-instructor", async () => {
      authenticateAs(memberUser);
      mockCreatePresetTag.mockRejectedValue(new ForbiddenError());

      const res = await request(app)
        .post("/tags/preset")
        .set("Authorization", "Bearer valid-token")
        .send({ name: "Variables" });

      expect(res.status).toBe(403);
    });

    it("returns 404 for nonexistent cohort", async () => {
      authenticateAs(adminUser);
      mockCreatePresetTag.mockRejectedValue(new CohortNotFoundError());

      const res = await request(app)
        .post("/tags/preset")
        .set("Authorization", "Bearer valid-token")
        .send({ name: "Variables", cohort_id: cohortId });

      expect(res.status).toBe(404);
    });

    it("returns 409 for duplicate preset", async () => {
      authenticateAs(adminUser);
      mockCreatePresetTag.mockRejectedValue(new TagAlreadyExistsError());

      const res = await request(app)
        .post("/tags/preset")
        .set("Authorization", "Bearer valid-token")
        .send({ name: "Variables", cohort_id: cohortId });

      expect(res.status).toBe(409);
    });
  });

  // ── PATCH /tags/:id ──

  describe("PATCH /tags/:id", () => {
    it("updates tag name", async () => {
      authenticateAs(memberUser);
      mockGetTagById.mockResolvedValue({ ...sampleTag, created_by: "user-1" });
      mockUpdateTag.mockResolvedValue({ ...sampleTag, name: "TypeScript" });

      const res = await request(app)
        .patch(`/tags/${tagId}`)
        .set("Authorization", "Bearer valid-token")
        .send({ name: "TypeScript" });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("TypeScript");
    });

    it("returns 404 when tag not found", async () => {
      authenticateAs(memberUser);
      mockGetTagById.mockResolvedValue(null);

      const res = await request(app)
        .patch(`/tags/${tagId}`)
        .set("Authorization", "Bearer valid-token")
        .send({ name: "X" });

      expect(res.status).toBe(404);
    });

    it("returns 403 for non-creator", async () => {
      authenticateAs(memberUser);
      mockGetTagById.mockResolvedValue({ ...sampleTag, created_by: "user-2" });

      const res = await request(app)
        .patch(`/tags/${tagId}`)
        .set("Authorization", "Bearer valid-token")
        .send({ name: "X" });

      expect(res.status).toBe(403);
    });

    it("returns 409 for duplicate name", async () => {
      authenticateAs(memberUser);
      mockGetTagById.mockResolvedValue({ ...sampleTag, created_by: "user-1" });
      mockUpdateTag.mockRejectedValue(new TagAlreadyExistsError());

      const res = await request(app)
        .patch(`/tags/${tagId}`)
        .set("Authorization", "Bearer valid-token")
        .send({ name: "Duplicate" });

      expect(res.status).toBe(409);
    });
  });

  // ── DELETE /tags/:id ──

  describe("DELETE /tags/:id", () => {
    it("deletes a tag", async () => {
      authenticateAs(memberUser);
      mockGetTagById.mockResolvedValue({ ...sampleTag, created_by: "user-1" });
      mockDeleteTag.mockResolvedValue(true);

      const res = await request(app)
        .delete(`/tags/${tagId}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(204);
    });

    it("returns 404 when tag not found", async () => {
      authenticateAs(memberUser);
      mockGetTagById.mockResolvedValue(null);

      const res = await request(app)
        .delete(`/tags/${tagId}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("returns 403 for non-creator", async () => {
      authenticateAs(memberUser);
      mockGetTagById.mockResolvedValue({ ...sampleTag, created_by: "user-2" });

      const res = await request(app)
        .delete(`/tags/${tagId}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });
  });

  // ── POST /threads/:id/tags ──

  describe("POST /threads/:id/tags", () => {
    it("adds tag to thread", async () => {
      authenticateAs(memberUser);
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockAddTagToThread.mockResolvedValue({
        thread_id: "thread-1", tag_id: tagId, created_at: "2026-01-01T00:00:00.000Z",
      });

      const res = await request(app)
        .post("/threads/thread-1/tags")
        .set("Authorization", "Bearer valid-token")
        .send({ tag_id: tagId });

      expect(res.status).toBe(201);
      expect(res.body.tag_id).toBe(tagId);
    });

    it("returns 400 for invalid tag", async () => {
      authenticateAs(memberUser);
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockAddTagToThread.mockRejectedValue(new InvalidTagError());

      const res = await request(app)
        .post("/threads/thread-1/tags")
        .set("Authorization", "Bearer valid-token")
        .send({ tag_id: tagId });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_TAG");
    });

    it("returns 409 when already tagged", async () => {
      authenticateAs(memberUser);
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockAddTagToThread.mockRejectedValue(new AlreadyTaggedError());

      const res = await request(app)
        .post("/threads/thread-1/tags")
        .set("Authorization", "Bearer valid-token")
        .send({ tag_id: tagId });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ALREADY_TAGGED");
    });

    it("returns 404 when thread not found", async () => {
      authenticateAs(memberUser);
      mockGetThreadOwnerId.mockResolvedValue(null);

      const res = await request(app)
        .post("/threads/nonexistent/tags")
        .set("Authorization", "Bearer valid-token")
        .send({ tag_id: tagId });

      expect(res.status).toBe(404);
    });

    it("returns 403 for non-owner", async () => {
      authenticateAs(memberUser);
      mockGetThreadOwnerId.mockResolvedValue("user-2");

      const res = await request(app)
        .post("/threads/thread-1/tags")
        .set("Authorization", "Bearer valid-token")
        .send({ tag_id: tagId });

      expect(res.status).toBe(403);
    });
  });

  // ── DELETE /threads/:id/tags/:tag_id ──

  describe("DELETE /threads/:id/tags/:tag_id", () => {
    it("removes tag from thread", async () => {
      authenticateAs(memberUser);
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockRemoveTagFromThread.mockResolvedValue(true);

      const res = await request(app)
        .delete(`/threads/thread-1/tags/${tagId}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(204);
    });

    it("returns 404 when tag not assigned", async () => {
      authenticateAs(memberUser);
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockRemoveTagFromThread.mockResolvedValue(false);

      const res = await request(app)
        .delete(`/threads/thread-1/tags/${tagId}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("returns 404 when thread not found", async () => {
      authenticateAs(memberUser);
      mockGetThreadOwnerId.mockResolvedValue(null);

      const res = await request(app)
        .delete(`/threads/nonexistent/tags/${tagId}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });
  });
});
