import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { getDb, getClient_UNSAFE } from "../../db/connection.js";
import { users, workspaces, cohorts, userCohorts } from "../../db/schema/auth.js";
import { threads, tags, threadTags } from "../../db/schema/threads.js";
import {
  listTags,
  createCustomTag,
  createPresetTag,
  getTagById,
  updateTag,
  deleteTag,
  addTagToThread,
  removeTagFromThread,
  TagAlreadyExistsError,
  InvalidTagError,
  AlreadyTaggedError,
  CohortNotFoundError,
  ForbiddenError,
} from "../../services/tags.js";

let testUser: { id: string };
let instructorUser: { id: string };
let adminUser: { id: string };
let testCohort: { id: string };
let testWorkspace: { id: string };
let testThread: { id: string };

beforeEach(async () => {
  await getDb().execute(
    sql`TRUNCATE threads, thread_tags, tags, bookmarks, todos, messages, user_cohorts, cohorts, workspaces, users CASCADE`,
  );

  const [student] = await getDb()
    .insert(users)
    .values({ email: "student@test.com", display_name: "Student", external_auth_id: "uid-student" })
    .returning();
  testUser = student;

  const [instructor] = await getDb()
    .insert(users)
    .values({ email: "instructor@test.com", display_name: "Instructor", external_auth_id: "uid-instructor" })
    .returning();
  instructorUser = instructor;

  const [admin] = await getDb()
    .insert(users)
    .values({ email: "admin@test.com", display_name: "Admin", role: "admin", external_auth_id: "uid-admin" })
    .returning();
  adminUser = admin;

  const [ws] = await getDb()
    .insert(workspaces)
    .values({ type: "cohort", name: "Q1" })
    .returning();
  testWorkspace = ws;

  const [cohort] = await getDb()
    .insert(cohorts)
    .values({ workspace_id: ws.id, name: "Q1 2026", start_date: "2026-01-01", end_date: "2026-12-31" })
    .returning();
  testCohort = cohort;

  await getDb().insert(userCohorts).values({
    user_id: instructorUser.id,
    cohort_id: testCohort.id,
    role_in_cohort: "instructor",
  });

  const [thread] = await getDb()
    .insert(threads)
    .values({ user_id: testUser.id, workspace_id: ws.id, title: "Test Thread" })
    .returning();
  testThread = thread;
});

afterAll(async () => {
  await getClient_UNSAFE().end();
});

describe("tags service", () => {
  describe("createCustomTag", () => {
    it("creates a custom tag", async () => {
      const tag = await createCustomTag({ name: "My Tag", user_id: testUser.id });

      expect(tag.name).toBe("My Tag");
      expect(tag.type).toBe("custom");
      expect(tag.cohort_id).toBeNull();
    });

    it("throws TagAlreadyExistsError for duplicate name", async () => {
      await createCustomTag({ name: "Dup", user_id: testUser.id });

      await expect(
        createCustomTag({ name: "Dup", user_id: testUser.id }),
      ).rejects.toThrow(TagAlreadyExistsError);
    });

    it("allows same name for different users", async () => {
      await createCustomTag({ name: "Same", user_id: testUser.id });
      const tag = await createCustomTag({ name: "Same", user_id: instructorUser.id });

      expect(tag.name).toBe("Same");
    });
  });

  describe("createPresetTag", () => {
    it("creates a preset tag as admin", async () => {
      const tag = await createPresetTag({
        name: "Variables",
        cohort_id: testCohort.id,
        user_id: adminUser.id,
        user_role: "admin",
      });

      expect(tag.type).toBe("preset");
      expect(tag.cohort_id).toBe(testCohort.id);
    });

    it("creates a preset tag as instructor of cohort", async () => {
      const tag = await createPresetTag({
        name: "Loops",
        cohort_id: testCohort.id,
        user_id: instructorUser.id,
        user_role: "member",
      });

      expect(tag.type).toBe("preset");
    });

    it("creates a global preset as admin", async () => {
      const tag = await createPresetTag({
        name: "Global",
        cohort_id: null,
        user_id: adminUser.id,
        user_role: "admin",
      });

      expect(tag.cohort_id).toBeNull();
    });

    it("throws ForbiddenError for non-admin global preset", async () => {
      await expect(
        createPresetTag({
          name: "Global",
          cohort_id: null,
          user_id: instructorUser.id,
          user_role: "member",
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("throws ForbiddenError for non-instructor of cohort", async () => {
      await expect(
        createPresetTag({
          name: "Nope",
          cohort_id: testCohort.id,
          user_id: testUser.id,
          user_role: "member",
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("throws CohortNotFoundError for nonexistent cohort", async () => {
      await expect(
        createPresetTag({
          name: "X",
          cohort_id: "00000000-0000-0000-0000-000000000000",
          user_id: adminUser.id,
          user_role: "admin",
        }),
      ).rejects.toThrow(CohortNotFoundError);
    });

    it("throws TagAlreadyExistsError for duplicate in same scope", async () => {
      await createPresetTag({
        name: "Dup",
        cohort_id: testCohort.id,
        user_id: adminUser.id,
        user_role: "admin",
      });

      await expect(
        createPresetTag({
          name: "Dup",
          cohort_id: testCohort.id,
          user_id: adminUser.id,
          user_role: "admin",
        }),
      ).rejects.toThrow(TagAlreadyExistsError);
    });

    it("allows same name in different cohorts", async () => {
      const [ws2] = await getDb()
        .insert(workspaces)
        .values({ type: "cohort", name: "Q2" })
        .returning();
      const [cohort2] = await getDb()
        .insert(cohorts)
        .values({ workspace_id: ws2.id, name: "Q2 2026", start_date: "2026-04-01", end_date: "2026-12-31" })
        .returning();

      await createPresetTag({ name: "Same", cohort_id: testCohort.id, user_id: adminUser.id, user_role: "admin" });
      const tag = await createPresetTag({ name: "Same", cohort_id: cohort2.id, user_id: adminUser.id, user_role: "admin" });

      expect(tag.name).toBe("Same");
    });
  });

  describe("listTags", () => {
    it("returns preset + custom tags", async () => {
      await createPresetTag({ name: "Preset", cohort_id: testCohort.id, user_id: adminUser.id, user_role: "admin" });
      await createCustomTag({ name: "Custom", user_id: testUser.id });

      const items = await listTags({ cohort_id: testCohort.id, user_id: testUser.id });

      expect(items).toHaveLength(2);
      // preset first (type DESC: 'preset' > 'custom' alphabetically)
      expect(items[0].type).toBe("preset");
      expect(items[1].type).toBe("custom");
    });

    it("includes global presets", async () => {
      await createPresetTag({ name: "Global", cohort_id: null, user_id: adminUser.id, user_role: "admin" });

      const items = await listTags({ cohort_id: testCohort.id, user_id: testUser.id });

      expect(items).toHaveLength(1);
      expect(items[0].name).toBe("Global");
    });

    it("does not include other user's custom tags", async () => {
      await createCustomTag({ name: "Other's Tag", user_id: instructorUser.id });

      const items = await listTags({ cohort_id: testCohort.id, user_id: testUser.id });

      expect(items).toHaveLength(0);
    });
  });

  describe("updateTag", () => {
    it("updates tag name", async () => {
      const tag = await createCustomTag({ name: "Old", user_id: testUser.id });
      const updated = await updateTag(tag.id, { name: "New" });

      expect(updated!.name).toBe("New");
    });

    it("throws TagAlreadyExistsError for duplicate", async () => {
      await createCustomTag({ name: "Existing", user_id: testUser.id });
      const tag = await createCustomTag({ name: "Other", user_id: testUser.id });

      await expect(
        updateTag(tag.id, { name: "Existing" }),
      ).rejects.toThrow(TagAlreadyExistsError);
    });

    it("returns null for nonexistent tag", async () => {
      const result = await updateTag("00000000-0000-0000-0000-000000000000", { name: "X" });
      expect(result).toBeNull();
    });
  });

  describe("deleteTag", () => {
    it("deletes tag", async () => {
      const tag = await createCustomTag({ name: "Delete", user_id: testUser.id });
      const deleted = await deleteTag(tag.id);

      expect(deleted).toBe(true);

      const check = await getTagById(tag.id);
      expect(check).toBeNull();
    });

    it("returns false for nonexistent tag", async () => {
      const deleted = await deleteTag("00000000-0000-0000-0000-000000000000");
      expect(deleted).toBe(false);
    });
  });

  describe("addTagToThread", () => {
    it("adds a preset tag", async () => {
      const tag = await createPresetTag({ name: "Preset", cohort_id: testCohort.id, user_id: adminUser.id, user_role: "admin" });
      const result = await addTagToThread({ thread_id: testThread.id, tag_id: tag.id, user_id: testUser.id });

      expect(result.thread_id).toBe(testThread.id);
      expect(result.tag_id).toBe(tag.id);
    });

    it("adds own custom tag", async () => {
      const tag = await createCustomTag({ name: "Mine", user_id: testUser.id });
      const result = await addTagToThread({ thread_id: testThread.id, tag_id: tag.id, user_id: testUser.id });

      expect(result.tag_id).toBe(tag.id);
    });

    it("throws InvalidTagError for other user's custom tag", async () => {
      const tag = await createCustomTag({ name: "Other", user_id: instructorUser.id });

      await expect(
        addTagToThread({ thread_id: testThread.id, tag_id: tag.id, user_id: testUser.id }),
      ).rejects.toThrow(InvalidTagError);
    });

    it("throws InvalidTagError for nonexistent tag", async () => {
      await expect(
        addTagToThread({ thread_id: testThread.id, tag_id: "00000000-0000-0000-0000-000000000000", user_id: testUser.id }),
      ).rejects.toThrow(InvalidTagError);
    });

    it("throws AlreadyTaggedError for duplicate", async () => {
      const tag = await createCustomTag({ name: "Tag", user_id: testUser.id });
      await addTagToThread({ thread_id: testThread.id, tag_id: tag.id, user_id: testUser.id });

      await expect(
        addTagToThread({ thread_id: testThread.id, tag_id: tag.id, user_id: testUser.id }),
      ).rejects.toThrow(AlreadyTaggedError);
    });
  });

  describe("removeTagFromThread", () => {
    it("removes tag from thread", async () => {
      const tag = await createCustomTag({ name: "Remove", user_id: testUser.id });
      await addTagToThread({ thread_id: testThread.id, tag_id: tag.id, user_id: testUser.id });

      const removed = await removeTagFromThread(testThread.id, tag.id);
      expect(removed).toBe(true);
    });

    it("returns false when tag not assigned", async () => {
      const tag = await createCustomTag({ name: "Not Assigned", user_id: testUser.id });
      const removed = await removeTagFromThread(testThread.id, tag.id);
      expect(removed).toBe(false);
    });
  });
});
