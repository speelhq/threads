import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb, getClient_UNSAFE } from "../../db/connection.js";
import { users, workspaces, cohorts, userCohorts } from "../../db/schema/auth.js";
import { threads, messages } from "../../db/schema/threads.js";
import {
  listMessages,
  createMessage,
  getMessageById,
  updateMessage,
  deleteMessage,
  reorderMessages,
  InvalidMessageIdsError,
  IncompleteMessageIdsError,
} from "../../services/messages.js";

let testUser: { id: string };
let testThread: { id: string };

beforeEach(async () => {
  await getDb().execute(
    sql`TRUNCATE threads, thread_tags, tags, bookmarks, todos, messages, user_cohorts, cohorts, workspaces, users CASCADE`,
  );

  // Create test data
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

describe("messages service", () => {
  describe("createMessage", () => {
    it("creates a message with position 0", async () => {
      const msg = await createMessage({ thread_id: testThread.id, body: "First" });

      expect(msg.body).toBe("First");
      expect(msg.position).toBe(0);
    });

    it("auto-increments position", async () => {
      await createMessage({ thread_id: testThread.id, body: "First" });
      const second = await createMessage({ thread_id: testThread.id, body: "Second" });

      expect(second.position).toBe(1);
    });

    it("updates thread updated_at", async () => {
      // Set thread's updated_at to a known past value
      const past = new Date("2020-01-01T00:00:00.000Z");
      await getDb().update(threads).set({ updated_at: past }).where(eq(threads.id, testThread.id));

      await createMessage({ thread_id: testThread.id, body: "Hello" });

      const [after] = await getDb()
        .select({ updated_at: threads.updated_at })
        .from(threads)
        .where(eq(threads.id, testThread.id));

      expect(after.updated_at.getTime()).toBeGreaterThan(past.getTime());
    });
  });

  describe("getMessageById", () => {
    it("returns message with thread_id", async () => {
      const created = await createMessage({ thread_id: testThread.id, body: "Hello" });
      const msg = await getMessageById(created.id);

      expect(msg).not.toBeNull();
      expect(msg!.thread_id).toBe(testThread.id);
      expect(msg!.body).toBe("Hello");
    });

    it("returns null for nonexistent message", async () => {
      const msg = await getMessageById("00000000-0000-0000-0000-000000000000");
      expect(msg).toBeNull();
    });
  });

  describe("updateMessage", () => {
    it("updates body", async () => {
      const created = await createMessage({ thread_id: testThread.id, body: "Original" });
      const updated = await updateMessage(created.id, { body: "Updated" });

      expect(updated).not.toBeNull();
      expect(updated!.body).toBe("Updated");
    });

    it("returns null for nonexistent message", async () => {
      const result = await updateMessage("00000000-0000-0000-0000-000000000000", { body: "X" });
      expect(result).toBeNull();
    });
  });

  describe("deleteMessage", () => {
    it("deletes message and returns thread_id", async () => {
      const created = await createMessage({ thread_id: testThread.id, body: "Delete me" });
      const result = await deleteMessage(created.id);

      expect(result).not.toBeNull();
      expect(result!.thread_id).toBe(testThread.id);

      const check = await getMessageById(created.id);
      expect(check).toBeNull();
    });

    it("returns null for nonexistent message", async () => {
      const result = await deleteMessage("00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });
  });

  describe("listMessages", () => {
    it("returns messages in position order", async () => {
      await createMessage({ thread_id: testThread.id, body: "First" });
      await createMessage({ thread_id: testThread.id, body: "Second" });
      await createMessage({ thread_id: testThread.id, body: "Third" });

      const result = await listMessages({ thread_id: testThread.id, limit: 50 });

      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].body).toBe("First");
      expect(result.messages[2].body).toBe("Third");
      expect(result.next_cursor).toBeNull();
    });

    it("paginates with cursor", async () => {
      await createMessage({ thread_id: testThread.id, body: "Msg 0" });
      await createMessage({ thread_id: testThread.id, body: "Msg 1" });
      await createMessage({ thread_id: testThread.id, body: "Msg 2" });

      const first = await listMessages({ thread_id: testThread.id, limit: 2 });
      expect(first.messages).toHaveLength(2);
      expect(first.next_cursor).not.toBeNull();

      const second = await listMessages({
        thread_id: testThread.id,
        cursor: first.next_cursor!,
        limit: 2,
      });
      expect(second.messages).toHaveLength(1);
      expect(second.next_cursor).toBeNull();
    });
  });

  describe("reorderMessages", () => {
    it("reorders messages", async () => {
      const m1 = await createMessage({ thread_id: testThread.id, body: "First" });
      const m2 = await createMessage({ thread_id: testThread.id, body: "Second" });
      const m3 = await createMessage({ thread_id: testThread.id, body: "Third" });

      const result = await reorderMessages(testThread.id, [m3.id, m1.id, m2.id]);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ id: m3.id, position: 0 });
      expect(result[1]).toEqual({ id: m1.id, position: 1 });
      expect(result[2]).toEqual({ id: m2.id, position: 2 });
    });

    it("throws InvalidMessageIdsError for wrong thread", async () => {
      // Create message in a different thread
      const [ws] = await getDb()
        .insert(workspaces)
        .values({ type: "cohort", name: "Other" })
        .returning();
      const [otherThread] = await getDb()
        .insert(threads)
        .values({ user_id: testUser.id, workspace_id: ws.id, title: "Other Thread" })
        .returning();
      const otherMsg = await createMessage({ thread_id: otherThread.id, body: "Other" });

      await expect(reorderMessages(testThread.id, [otherMsg.id])).rejects.toThrow(
        InvalidMessageIdsError,
      );
    });

    it("throws IncompleteMessageIdsError when not all messages included", async () => {
      const m1 = await createMessage({ thread_id: testThread.id, body: "First" });
      await createMessage({ thread_id: testThread.id, body: "Second" });

      await expect(reorderMessages(testThread.id, [m1.id])).rejects.toThrow(
        IncompleteMessageIdsError,
      );
    });
  });
});
