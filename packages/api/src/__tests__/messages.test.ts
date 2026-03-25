import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import {
  mockFirebaseToken,
  resetFirebaseMocks,
} from "./helpers.js";

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

vi.mock("../services/messages.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/messages.js")>();
  return {
    ...actual,
    listMessages: vi.fn(),
    createMessage: vi.fn(),
    getMessageById: vi.fn(),
    updateMessage: vi.fn(),
    deleteMessage: vi.fn(),
    reorderMessages: vi.fn(),
  };
});

import { findUserByExternalId } from "../services/auth.js";
import { getThreadOwnerId } from "../services/threads.js";
import {
  listMessages,
  createMessage,
  getMessageById,
  updateMessage,
  deleteMessage,
  reorderMessages,
  InvalidMessageIdsError,
  IncompleteMessageIdsError,
} from "../services/messages.js";

const mockFindUser = findUserByExternalId as ReturnType<typeof vi.fn>;
const mockGetThreadOwnerId = getThreadOwnerId as ReturnType<typeof vi.fn>;
const mockListMessages = listMessages as ReturnType<typeof vi.fn>;
const mockCreateMessage = createMessage as ReturnType<typeof vi.fn>;
const mockGetMessageById = getMessageById as ReturnType<typeof vi.fn>;
const mockUpdateMessage = updateMessage as ReturnType<typeof vi.fn>;
const mockDeleteMessage = deleteMessage as ReturnType<typeof vi.fn>;
const mockReorderMessages = reorderMessages as ReturnType<typeof vi.fn>;

const user = {
  id: "user-1",
  email: "student@example.com",
  display_name: "Student",
  role: "member" as const,
};

const sampleMessage = {
  id: "msg-1",
  body: "Hello",
  position: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function authenticate() {
  mockFirebaseToken("uid-1", user.email);
  mockFindUser.mockResolvedValue(user);
}

describe("Message endpoints", () => {
  beforeEach(() => {
    resetFirebaseMocks();
    mockFindUser.mockReset();
    mockGetThreadOwnerId.mockReset();
    mockListMessages.mockReset();
    mockCreateMessage.mockReset();
    mockGetMessageById.mockReset();
    mockUpdateMessage.mockReset();
    mockDeleteMessage.mockReset();
    mockReorderMessages.mockReset();
  });

  // ── GET /threads/:id/messages ──

  describe("GET /threads/:id/messages", () => {
    it("returns message list", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockListMessages.mockResolvedValue({ messages: [sampleMessage], next_cursor: null });

      const res = await request(app)
        .get("/threads/thread-1/messages")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(1);
      expect(res.body.next_cursor).toBeNull();
    });

    it("returns 404 when thread not found", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue(null);

      const res = await request(app)
        .get("/threads/nonexistent/messages")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("returns 403 for non-owner", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue("user-2");

      const res = await request(app)
        .get("/threads/thread-1/messages")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });
  });

  // ── POST /threads/:id/messages ──

  describe("POST /threads/:id/messages", () => {
    it("creates a message", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockCreateMessage.mockResolvedValue(sampleMessage);

      const res = await request(app)
        .post("/threads/thread-1/messages")
        .set("Authorization", "Bearer valid-token")
        .send({ body: "Hello" });

      expect(res.status).toBe(201);
      expect(res.body.body).toBe("Hello");
    });

    it("returns 400 for empty body", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue("user-1");

      const res = await request(app)
        .post("/threads/thread-1/messages")
        .set("Authorization", "Bearer valid-token")
        .send({ body: "" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 when thread not found", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue(null);

      const res = await request(app)
        .post("/threads/nonexistent/messages")
        .set("Authorization", "Bearer valid-token")
        .send({ body: "Hello" });

      expect(res.status).toBe(404);
    });

    it("returns 403 for non-owner", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue("user-2");

      const res = await request(app)
        .post("/threads/thread-1/messages")
        .set("Authorization", "Bearer valid-token")
        .send({ body: "Hello" });

      expect(res.status).toBe(403);
    });
  });

  // ── PATCH /messages/:id ──

  describe("PATCH /messages/:id", () => {
    it("updates a message", async () => {
      authenticate();
      mockGetMessageById.mockResolvedValue({ ...sampleMessage, thread_id: "thread-1" });
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockUpdateMessage.mockResolvedValue({ ...sampleMessage, thread_id: "thread-1", body: "Updated" });

      const res = await request(app)
        .patch("/messages/msg-1")
        .set("Authorization", "Bearer valid-token")
        .send({ body: "Updated" });

      expect(res.status).toBe(200);
      expect(res.body.body).toBe("Updated");
      expect(res.body.thread_id).toBeUndefined();
    });

    it("returns 404 when message not found", async () => {
      authenticate();
      mockGetMessageById.mockResolvedValue(null);

      const res = await request(app)
        .patch("/messages/nonexistent")
        .set("Authorization", "Bearer valid-token")
        .send({ body: "Updated" });

      expect(res.status).toBe(404);
    });

    it("returns 403 for non-owner", async () => {
      authenticate();
      mockGetMessageById.mockResolvedValue({ ...sampleMessage, thread_id: "thread-1" });
      mockGetThreadOwnerId.mockResolvedValue("user-2");

      const res = await request(app)
        .patch("/messages/msg-1")
        .set("Authorization", "Bearer valid-token")
        .send({ body: "Updated" });

      expect(res.status).toBe(403);
    });

    it("returns 400 for empty body", async () => {
      authenticate();
      mockGetMessageById.mockResolvedValue({ ...sampleMessage, thread_id: "thread-1" });
      mockGetThreadOwnerId.mockResolvedValue("user-1");

      const res = await request(app)
        .patch("/messages/msg-1")
        .set("Authorization", "Bearer valid-token")
        .send({ body: "" });

      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /messages/:id ──

  describe("DELETE /messages/:id", () => {
    it("deletes a message", async () => {
      authenticate();
      mockGetMessageById.mockResolvedValue({ ...sampleMessage, thread_id: "thread-1" });
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockDeleteMessage.mockResolvedValue({ thread_id: "thread-1" });

      const res = await request(app)
        .delete("/messages/msg-1")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(204);
    });

    it("returns 404 when message not found", async () => {
      authenticate();
      mockGetMessageById.mockResolvedValue(null);

      const res = await request(app)
        .delete("/messages/nonexistent")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("returns 403 for non-owner", async () => {
      authenticate();
      mockGetMessageById.mockResolvedValue({ ...sampleMessage, thread_id: "thread-1" });
      mockGetThreadOwnerId.mockResolvedValue("user-2");

      const res = await request(app)
        .delete("/messages/msg-1")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });
  });

  // ── PATCH /threads/:id/messages/reorder ──

  describe("PATCH /threads/:id/messages/reorder", () => {
    const uuid1 = "a0000000-0000-4000-8000-000000000001";
    const uuid2 = "a0000000-0000-4000-8000-000000000002";

    it("reorders messages", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockReorderMessages.mockResolvedValue([
        { id: uuid2, position: 0 },
        { id: uuid1, position: 1 },
      ]);

      const res = await request(app)
        .patch("/threads/thread-1/messages/reorder")
        .set("Authorization", "Bearer valid-token")
        .send({ message_ids: [uuid2, uuid1] });

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(2);
      expect(res.body.messages[0].position).toBe(0);
    });

    it("returns 400 for invalid message IDs", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockReorderMessages.mockRejectedValue(new InvalidMessageIdsError());

      const res = await request(app)
        .patch("/threads/thread-1/messages/reorder")
        .set("Authorization", "Bearer valid-token")
        .send({ message_ids: [uuid1] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_MESSAGE_IDS");
    });

    it("returns 400 for incomplete message IDs", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue("user-1");
      mockReorderMessages.mockRejectedValue(new IncompleteMessageIdsError());

      const res = await request(app)
        .patch("/threads/thread-1/messages/reorder")
        .set("Authorization", "Bearer valid-token")
        .send({ message_ids: [uuid1] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INCOMPLETE_MESSAGE_IDS");
    });

    it("returns 404 when thread not found", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue(null);

      const res = await request(app)
        .patch("/threads/nonexistent/messages/reorder")
        .set("Authorization", "Bearer valid-token")
        .send({ message_ids: [uuid1] });

      expect(res.status).toBe(404);
    });

    it("returns 403 for non-owner", async () => {
      authenticate();
      mockGetThreadOwnerId.mockResolvedValue("user-2");

      const res = await request(app)
        .patch("/threads/thread-1/messages/reorder")
        .set("Authorization", "Bearer valid-token")
        .send({ message_ids: [uuid1] });

      expect(res.status).toBe(403);
    });
  });
});
