import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db, client } from "../../db/connection.js";
import { users } from "../../db/schema/auth.js";
import { cohorts, userCohorts } from "../../db/schema/auth.js";
import {
  findUserByExternalId,
  createUser,
  getUserWithCohorts,
} from "../../services/auth.js";

beforeEach(async () => {
  await db.delete(userCohorts);
  await db.delete(cohorts);
  await db.delete(users);
});

afterAll(async () => {
  await client.end();
});

describe("auth service", () => {
  describe("findUserByExternalId", () => {
    it("returns user when found", async () => {
      await db.insert(users).values({
        email: "test@example.com",
        display_name: "Test User",
        external_auth_id: "firebase-uid-1",
      });

      const user = await findUserByExternalId("firebase-uid-1");

      expect(user).not.toBeNull();
      expect(user!.email).toBe("test@example.com");
      expect(user!.display_name).toBe("Test User");
      expect(user!.role).toBe("member");
    });

    it("returns null when not found", async () => {
      const user = await findUserByExternalId("nonexistent");
      expect(user).toBeNull();
    });
  });

  describe("createUser", () => {
    it("creates a user with default role member", async () => {
      const user = await createUser({
        email: "new@example.com",
        display_name: "New User",
        external_auth_id: "uid-new",
      });

      expect(user.id).toBeDefined();
      expect(user.email).toBe("new@example.com");
      expect(user.display_name).toBe("New User");
      expect(user.role).toBe("member");
      expect(user.created_at).toBeDefined();
    });

    it("does not return external_auth_id", async () => {
      const user = await createUser({
        email: "new@example.com",
        display_name: "New User",
        external_auth_id: "uid-new",
      });

      expect(user).not.toHaveProperty("external_auth_id");
    });

    it("rejects duplicate email", async () => {
      await createUser({
        email: "dup@example.com",
        display_name: "User 1",
        external_auth_id: "uid-1",
      });

      await expect(
        createUser({
          email: "dup@example.com",
          display_name: "User 2",
          external_auth_id: "uid-2",
        }),
      ).rejects.toThrow();
    });

    it("returns null on duplicate external_auth_id", async () => {
      await createUser({
        email: "a@example.com",
        display_name: "User 1",
        external_auth_id: "uid-dup",
      });

      const result = await createUser({
        email: "b@example.com",
        display_name: "User 2",
        external_auth_id: "uid-dup",
      });

      expect(result).toBeNull();
    });
  });

  describe("getUserWithCohorts", () => {
    it("returns user with empty cohorts", async () => {
      const created = await createUser({
        email: "solo@example.com",
        display_name: "Solo",
        external_auth_id: "uid-solo",
      });

      const result = await getUserWithCohorts(created.id);

      expect(result).not.toBeNull();
      expect(result!.email).toBe("solo@example.com");
      expect(result!.cohorts).toHaveLength(0);
    });

    it("returns null for nonexistent user", async () => {
      const result = await getUserWithCohorts("00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });

    it("returns user with cohort memberships", async () => {
      const user = await createUser({
        email: "student@example.com",
        display_name: "Student",
        external_auth_id: "uid-student",
      });

      const [cohort] = await db
        .insert(cohorts)
        .values({
          name: "Cohort 2026-Q1",
          start_date: "2026-01-01",
          end_date: "2026-03-31",
        })
        .returning();

      await db.insert(userCohorts).values({
        user_id: user.id,
        cohort_id: cohort.id,
        role_in_cohort: "student",
      });

      const result = await getUserWithCohorts(user.id);

      expect(result!.cohorts).toHaveLength(1);
      expect(result!.cohorts[0].name).toBe("Cohort 2026-Q1");
      expect(result!.cohorts[0].role_in_cohort).toBe("student");
      expect(result!.cohorts[0].start_date).toBe("2026-01-01");
    });

    it("returns multiple cohorts with different roles", async () => {
      const user = await createUser({
        email: "multi@example.com",
        display_name: "Multi",
        external_auth_id: "uid-multi",
      });

      const [c1] = await db
        .insert(cohorts)
        .values({ name: "Q1", start_date: "2026-01-01", end_date: "2026-03-31" })
        .returning();

      const [c2] = await db
        .insert(cohorts)
        .values({ name: "Q2", start_date: "2026-04-01", end_date: "2026-06-30" })
        .returning();

      await db.insert(userCohorts).values([
        { user_id: user.id, cohort_id: c1.id, role_in_cohort: "student" as const },
        { user_id: user.id, cohort_id: c2.id, role_in_cohort: "instructor" as const },
      ]);

      const result = await getUserWithCohorts(user.id);

      expect(result!.cohorts).toHaveLength(2);
      const roles = result!.cohorts.map((c) => c.role_in_cohort).sort();
      expect(roles).toEqual(["instructor", "student"]);
    });

    it("does not return external_auth_id or updated_at", async () => {
      const user = await createUser({
        email: "fields@example.com",
        display_name: "Fields",
        external_auth_id: "uid-fields",
      });

      const result = await getUserWithCohorts(user.id);

      expect(result).not.toHaveProperty("external_auth_id");
      expect(result).not.toHaveProperty("updated_at");
    });
  });
});
