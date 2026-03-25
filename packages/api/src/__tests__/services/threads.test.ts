import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb, getClient_UNSAFE } from "../../db/connection.js";
import { users, workspaces, cohorts, userCohorts } from "../../db/schema/auth.js";
import { threads, messages, todos, bookmarks, tags, threadTags } from "../../db/schema/threads.js";
import {
  resolveWorkspaceId,
  createThread,
  getThreadById,
  getThreadOwnerId,
  updateThread,
  deleteThread,
  listThreads,
  InvalidTagError,
} from "../../services/threads.js";

let testUser: { id: string };
let testWorkspace: { id: string };
let testCohort: { id: string };

async function createTestUser(email: string, name: string) {
  const [user] = await getDb()
    .insert(users)
    .values({ email, display_name: name, external_auth_id: `uid-${email}` })
    .returning();
  return user;
}

async function createTestCohort(name: string) {
  const [ws] = await getDb()
    .insert(workspaces)
    .values({ type: "cohort", name })
    .returning();
  const [cohort] = await getDb()
    .insert(cohorts)
    .values({ workspace_id: ws.id, name, start_date: "2026-01-01", end_date: "2026-12-31" })
    .returning();
  return { workspace: ws, cohort };
}

beforeEach(async () => {
  await getDb().execute(
    sql`TRUNCATE threads, thread_tags, tags, bookmarks, todos, messages, user_cohorts, cohorts, workspaces, users CASCADE`,
  );

  // Create shared test data
  testUser = await createTestUser("student@test.com", "Student");
  const { workspace, cohort } = await createTestCohort("Q1 2026");
  testWorkspace = workspace;
  testCohort = cohort;
  await getDb().insert(userCohorts).values({
    user_id: testUser.id,
    cohort_id: testCohort.id,
    role_in_cohort: "student",
  });
});

afterAll(async () => {
  await getClient_UNSAFE().end();
});

describe("threads service", () => {
  describe("resolveWorkspaceId", () => {
    it("returns workspace_id for student", async () => {
      const wsId = await resolveWorkspaceId(testUser.id);
      expect(wsId).toBe(testWorkspace.id);
    });

    it("returns null for user with no student cohort", async () => {
      const instructor = await createTestUser("instructor@test.com", "Instructor");
      await getDb().insert(userCohorts).values({
        user_id: instructor.id,
        cohort_id: testCohort.id,
        role_in_cohort: "instructor",
      });

      const wsId = await resolveWorkspaceId(instructor.id);
      expect(wsId).toBeNull();
    });

    it("returns null for unknown user", async () => {
      const wsId = await resolveWorkspaceId("00000000-0000-0000-0000-000000000000");
      expect(wsId).toBeNull();
    });
  });

  describe("createThread", () => {
    it("creates a thread", async () => {
      const thread = await createThread({
        user_id: testUser.id,
        workspace_id: testWorkspace.id,
        title: "My first thread",
      });

      expect(thread.title).toBe("My first thread");
      expect(thread.workspace_id).toBe(testWorkspace.id);
      expect(thread.pinned_at).toBeNull();
      expect(thread.incomplete_todo_count).toBe(0);
      expect(thread.tags).toEqual([]);
    });

    it("creates a thread with tag_ids", async () => {
      // Create a preset tag
      const [tag] = await getDb()
        .insert(tags)
        .values({ name: "JavaScript", type: "preset", created_by: testUser.id })
        .returning();

      const thread = await createThread({
        user_id: testUser.id,
        workspace_id: testWorkspace.id,
        title: "Tagged thread",
        tag_ids: [tag.id],
      });

      expect(thread.id).toBeDefined();

      // Verify thread_tags was inserted
      const tagLinks = await getDb()
        .select()
        .from(threadTags)
        .where(eq(threadTags.thread_id, thread.id));
      expect(tagLinks).toHaveLength(1);
      expect(tagLinks[0].tag_id).toBe(tag.id);
    });

    it("throws InvalidTagError for nonexistent tag", async () => {
      await expect(
        createThread({
          user_id: testUser.id,
          workspace_id: testWorkspace.id,
          title: "Bad tags",
          tag_ids: ["00000000-0000-0000-0000-000000000000"],
        }),
      ).rejects.toThrow(InvalidTagError);
    });

    it("throws InvalidTagError for other user's custom tag", async () => {
      const otherUser = await createTestUser("other@test.com", "Other");
      const [customTag] = await getDb()
        .insert(tags)
        .values({ name: "Private", type: "custom", created_by: otherUser.id })
        .returning();

      await expect(
        createThread({
          user_id: testUser.id,
          workspace_id: testWorkspace.id,
          title: "Inaccessible tag",
          tag_ids: [customTag.id],
        }),
      ).rejects.toThrow(InvalidTagError);
    });
  });

  describe("getThreadById", () => {
    it("returns thread with empty collections", async () => {
      const created = await createThread({
        user_id: testUser.id,
        workspace_id: testWorkspace.id,
        title: "Detail test",
      });

      const thread = await getThreadById(created.id);
      expect(thread).not.toBeNull();
      expect(thread!.title).toBe("Detail test");
      expect(thread!.messages).toEqual([]);
      expect(thread!.todos).toEqual([]);
      expect(thread!.bookmarks).toEqual([]);
      expect(thread!.tags).toEqual([]);
    });

    it("returns thread with messages, todos, bookmarks", async () => {
      const created = await createThread({
        user_id: testUser.id,
        workspace_id: testWorkspace.id,
        title: "Full thread",
      });

      await getDb().insert(messages).values({
        thread_id: created.id,
        body: "Hello",
        position: 0,
      });
      await getDb().insert(todos).values({
        thread_id: created.id,
        content: "Do this",
        position: 0,
      });
      await getDb().insert(bookmarks).values({
        thread_id: created.id,
        url: "https://example.com",
        domain: "example.com",
        position: 0,
      });

      const thread = await getThreadById(created.id);
      expect(thread!.messages).toHaveLength(1);
      expect(thread!.todos).toHaveLength(1);
      expect(thread!.bookmarks).toHaveLength(1);
    });

    it("returns null for nonexistent thread", async () => {
      const thread = await getThreadById("00000000-0000-0000-0000-000000000000");
      expect(thread).toBeNull();
    });
  });

  describe("getThreadOwnerId", () => {
    it("returns user_id of thread owner", async () => {
      const created = await createThread({
        user_id: testUser.id,
        workspace_id: testWorkspace.id,
        title: "Owner test",
      });

      const ownerId = await getThreadOwnerId(created.id);
      expect(ownerId).toBe(testUser.id);
    });

    it("returns null for nonexistent thread", async () => {
      const ownerId = await getThreadOwnerId("00000000-0000-0000-0000-000000000000");
      expect(ownerId).toBeNull();
    });
  });

  describe("updateThread", () => {
    it("updates title", async () => {
      const created = await createThread({
        user_id: testUser.id,
        workspace_id: testWorkspace.id,
        title: "Original",
      });

      const updated = await updateThread(created.id, { title: "Updated" });
      expect(updated).not.toBeNull();
      expect(updated!.title).toBe("Updated");
    });

    it("pins a thread", async () => {
      const created = await createThread({
        user_id: testUser.id,
        workspace_id: testWorkspace.id,
        title: "Pin me",
      });

      const updated = await updateThread(created.id, { pinned: true });
      expect(updated!.pinned_at).not.toBeNull();
    });

    it("unpins a thread", async () => {
      const created = await createThread({
        user_id: testUser.id,
        workspace_id: testWorkspace.id,
        title: "Unpin me",
      });

      await updateThread(created.id, { pinned: true });
      const updated = await updateThread(created.id, { pinned: false });
      expect(updated!.pinned_at).toBeNull();
    });

    it("includes incomplete_todo_count", async () => {
      const created = await createThread({
        user_id: testUser.id,
        workspace_id: testWorkspace.id,
        title: "With todos",
      });

      await getDb().insert(todos).values([
        { thread_id: created.id, content: "Todo 1", position: 0 },
        { thread_id: created.id, content: "Todo 2", position: 1, completed_at: new Date() },
      ]);

      const updated = await updateThread(created.id, { title: "Updated" });
      expect(updated!.incomplete_todo_count).toBe(1);
    });

    it("returns null for nonexistent thread", async () => {
      const result = await updateThread("00000000-0000-0000-0000-000000000000", { title: "X" });
      expect(result).toBeNull();
    });
  });

  describe("deleteThread", () => {
    it("deletes thread and cascades", async () => {
      const created = await createThread({
        user_id: testUser.id,
        workspace_id: testWorkspace.id,
        title: "Delete me",
      });

      await getDb().insert(messages).values({
        thread_id: created.id,
        body: "Will be deleted",
        position: 0,
      });

      const deleted = await deleteThread(created.id);
      expect(deleted).toBe(true);

      // Verify cascade
      const remaining = await getDb()
        .select()
        .from(messages)
        .where(eq(messages.thread_id, created.id));
      expect(remaining).toHaveLength(0);
    });

    it("returns false for nonexistent thread", async () => {
      const deleted = await deleteThread("00000000-0000-0000-0000-000000000000");
      expect(deleted).toBe(false);
    });
  });

  describe("listThreads", () => {
    it("returns threads for user", async () => {
      await createThread({ user_id: testUser.id, workspace_id: testWorkspace.id, title: "Thread 1" });
      await createThread({ user_id: testUser.id, workspace_id: testWorkspace.id, title: "Thread 2" });

      const result = await listThreads({ user_id: testUser.id, limit: 20 });
      expect(result.threads).toHaveLength(2);
      expect(result.next_cursor).toBeNull();
    });

    it("does not return other user's threads", async () => {
      const other = await createTestUser("other@test.com", "Other");
      await createThread({ user_id: testUser.id, workspace_id: testWorkspace.id, title: "Mine" });
      await getDb().insert(threads).values({
        user_id: other.id,
        workspace_id: testWorkspace.id,
        title: "Not mine",
      });

      const result = await listThreads({ user_id: testUser.id, limit: 20 });
      expect(result.threads).toHaveLength(1);
      expect(result.threads[0].title).toBe("Mine");
    });

    it("filters by search", async () => {
      await createThread({ user_id: testUser.id, workspace_id: testWorkspace.id, title: "JavaScript basics" });
      await createThread({ user_id: testUser.id, workspace_id: testWorkspace.id, title: "Java generics" });

      const result = await listThreads({ user_id: testUser.id, search: "JavaScript", limit: 20 });
      expect(result.threads).toHaveLength(1);
      expect(result.threads[0].title).toBe("JavaScript basics");
    });

    it("paginates with cursor", async () => {
      await createThread({ user_id: testUser.id, workspace_id: testWorkspace.id, title: "Thread 1" });
      await createThread({ user_id: testUser.id, workspace_id: testWorkspace.id, title: "Thread 2" });
      await createThread({ user_id: testUser.id, workspace_id: testWorkspace.id, title: "Thread 3" });

      const first = await listThreads({ user_id: testUser.id, limit: 2 });
      expect(first.threads).toHaveLength(2);
      expect(first.next_cursor).not.toBeNull();

      const second = await listThreads({ user_id: testUser.id, cursor: first.next_cursor!, limit: 2 });
      expect(second.threads).toHaveLength(1);
      expect(second.next_cursor).toBeNull();
    });

    it("includes tags for each thread", async () => {
      const [tag] = await getDb()
        .insert(tags)
        .values({ name: "JS", type: "preset", created_by: testUser.id })
        .returning();

      const thread = await createThread({
        user_id: testUser.id,
        workspace_id: testWorkspace.id,
        title: "Tagged",
        tag_ids: [tag.id],
      });

      const result = await listThreads({ user_id: testUser.id, limit: 20 });
      const found = result.threads.find((t: { id: string }) => t.id === thread.id);
      expect(found).toBeDefined();
      expect(found!.tags).toHaveLength(1);
      expect(found!.tags[0].name).toBe("JS");
    });
  });
});
