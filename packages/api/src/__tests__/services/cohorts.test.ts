import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb, getClient_UNSAFE } from "../../db/connection.js";
import { users, workspaces, cohorts, userCohorts } from "../../db/schema/auth.js";
import {
  createCohort,
  getCohortById,
  listCohorts,
  updateCohort,
  listMembers,
  addMember,
  removeMember,
  isInstructorOfCohort,
  MemberAlreadyExistsError,
} from "../../services/cohorts.js";

beforeEach(async () => {
  await getDb().execute(
    sql`TRUNCATE threads, thread_tags, tags, bookmarks, todos, messages, user_cohorts, cohorts, workspaces, users CASCADE`,
  );
});

afterAll(async () => {
  await getClient_UNSAFE().end();
});

describe("cohorts service", () => {
  describe("createCohort", () => {
    it("creates a workspace and cohort atomically", async () => {
      const cohort = await createCohort({
        name: "Q1 2026",
        start_date: "2026-01-01",
        end_date: "2026-03-31",
      });

      expect(cohort.name).toBe("Q1 2026");
      expect(cohort.workspace_id).toBeDefined();
      expect(cohort.start_date).toBe("2026-01-01");

      // Verify workspace was created with correct attributes
      const [ws] = await getDb()
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, cohort.workspace_id));

      expect(ws).toBeDefined();
      expect(ws.type).toBe("cohort");
      expect(ws.name).toBe("Q1 2026");
      expect(ws.owner_id).toBeNull();
    });

    it("creates distinct workspaces for each cohort", async () => {
      const c1 = await createCohort({ name: "Q1", start_date: "2026-01-01", end_date: "2026-03-31" });
      const c2 = await createCohort({ name: "Q2", start_date: "2026-04-01", end_date: "2026-06-30" });

      expect(c1.workspace_id).not.toBe(c2.workspace_id);
    });
  });

  describe("getCohortById", () => {
    it("returns cohort with workspace_id and member_count", async () => {
      const created = await createCohort({ name: "Q1", start_date: "2026-01-01", end_date: "2026-03-31" });
      const cohort = await getCohortById(created.id);

      expect(cohort).not.toBeNull();
      expect(cohort!.workspace_id).toBe(created.workspace_id);
      expect(Number(cohort!.member_count)).toBe(0);
    });

    it("returns null for nonexistent id", async () => {
      const result = await getCohortById("00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });
  });

  describe("listCohorts", () => {
    it("returns cohorts ordered by start_date desc with workspace_id", async () => {
      await createCohort({ name: "Q1", start_date: "2026-01-01", end_date: "2026-03-31" });
      await createCohort({ name: "Q2", start_date: "2026-04-01", end_date: "2026-06-30" });

      const rows = await listCohorts();

      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe("Q2");
      expect(rows[1].name).toBe("Q1");
      expect(rows[0].workspace_id).toBeDefined();
      expect(rows[1].workspace_id).toBeDefined();
    });
  });

  describe("updateCohort", () => {
    it("syncs workspace name when cohort name is updated", async () => {
      const created = await createCohort({ name: "Old Name", start_date: "2026-01-01", end_date: "2026-03-31" });

      await updateCohort(created.id, { name: "New Name" });

      // Verify workspace name was synced
      const [ws] = await getDb()
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, created.workspace_id));

      expect(ws.name).toBe("New Name");
    });

    it("does not touch workspace when only dates are updated", async () => {
      const created = await createCohort({ name: "Q1", start_date: "2026-01-01", end_date: "2026-03-31" });

      await updateCohort(created.id, { end_date: "2026-04-30" });

      const [ws] = await getDb()
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, created.workspace_id));

      expect(ws.name).toBe("Q1");
    });

    it("returns null for nonexistent cohort", async () => {
      const result = await updateCohort("00000000-0000-0000-0000-000000000000", { name: "X" });
      expect(result).toBeNull();
    });

    it("returns updated cohort with workspace_id", async () => {
      const created = await createCohort({ name: "Q1", start_date: "2026-01-01", end_date: "2026-03-31" });
      const updated = await updateCohort(created.id, { name: "Updated" });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("Updated");
      expect(updated!.workspace_id).toBe(created.workspace_id);
    });
  });

  describe("members", () => {
    async function createTestUser(email: string, name: string) {
      const [user] = await getDb()
        .insert(users)
        .values({ email, display_name: name, external_auth_id: `uid-${email}` })
        .returning();
      return user;
    }

    it("adds and lists members", async () => {
      const cohort = await createCohort({ name: "Q1", start_date: "2026-01-01", end_date: "2026-03-31" });
      const user = await createTestUser("alice@test.com", "Alice");

      const result = await addMember({ cohort_id: cohort.id, user_id: user.id, role_in_cohort: "student" });
      expect("data" in result && result.data.role_in_cohort).toBe("student");

      const members = await listMembers(cohort.id);
      expect(members).toHaveLength(1);
      expect(members[0].display_name).toBe("Alice");
    });

    it("returns error for nonexistent user", async () => {
      const cohort = await createCohort({ name: "Q1", start_date: "2026-01-01", end_date: "2026-03-31" });
      const result = await addMember({ cohort_id: cohort.id, user_id: "00000000-0000-0000-0000-000000000000", role_in_cohort: "student" });
      expect("error" in result).toBe(true);
    });

    it("throws MemberAlreadyExistsError on duplicate", async () => {
      const cohort = await createCohort({ name: "Q1", start_date: "2026-01-01", end_date: "2026-03-31" });
      const user = await createTestUser("bob@test.com", "Bob");

      await addMember({ cohort_id: cohort.id, user_id: user.id, role_in_cohort: "student" });
      await expect(
        addMember({ cohort_id: cohort.id, user_id: user.id, role_in_cohort: "student" }),
      ).rejects.toThrow(MemberAlreadyExistsError);
    });

    it("removes member", async () => {
      const cohort = await createCohort({ name: "Q1", start_date: "2026-01-01", end_date: "2026-03-31" });
      const user = await createTestUser("carol@test.com", "Carol");
      await addMember({ cohort_id: cohort.id, user_id: user.id, role_in_cohort: "student" });

      const removed = await removeMember(cohort.id, user.id);
      expect(removed).toBe(true);

      const members = await listMembers(cohort.id);
      expect(members).toHaveLength(0);
    });

    it("returns false when removing nonexistent membership", async () => {
      const cohort = await createCohort({ name: "Q1", start_date: "2026-01-01", end_date: "2026-03-31" });
      const removed = await removeMember(cohort.id, "00000000-0000-0000-0000-000000000000");
      expect(removed).toBe(false);
    });

    it("detects instructor role", async () => {
      const cohort = await createCohort({ name: "Q1", start_date: "2026-01-01", end_date: "2026-03-31" });
      const user = await createTestUser("dave@test.com", "Dave");
      await addMember({ cohort_id: cohort.id, user_id: user.id, role_in_cohort: "instructor" });

      expect(await isInstructorOfCohort(user.id, cohort.id)).toBe(true);
    });

    it("returns false for non-instructor", async () => {
      const cohort = await createCohort({ name: "Q1", start_date: "2026-01-01", end_date: "2026-03-31" });
      const user = await createTestUser("eve@test.com", "Eve");
      await addMember({ cohort_id: cohort.id, user_id: user.id, role_in_cohort: "student" });

      expect(await isInstructorOfCohort(user.id, cohort.id)).toBe(false);
    });
  });
});
