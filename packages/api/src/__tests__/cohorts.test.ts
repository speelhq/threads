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
    createUser: vi.fn(),
    getUserWithCohorts: vi.fn(),
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

import { findUserByExternalId } from "../services/auth.js";
import {
  listCohorts,
  createCohort,
  getCohortById,
  updateCohort,
  listMembers,
  addMember,
  removeMember,
  isInstructorOfCohort,
  MemberAlreadyExistsError,
} from "../services/cohorts.js";

const mockFindUser = findUserByExternalId as ReturnType<typeof vi.fn>;
const mockListCohorts = listCohorts as ReturnType<typeof vi.fn>;
const mockCreateCohort = createCohort as ReturnType<typeof vi.fn>;
const mockGetCohortById = getCohortById as ReturnType<typeof vi.fn>;
const mockUpdateCohort = updateCohort as ReturnType<typeof vi.fn>;
const mockListMembers = listMembers as ReturnType<typeof vi.fn>;
const mockAddMember = addMember as ReturnType<typeof vi.fn>;
const mockRemoveMember = removeMember as ReturnType<typeof vi.fn>;
const mockIsInstructorOfCohort = isInstructorOfCohort as ReturnType<typeof vi.fn>;

const adminUser = {
  id: "admin-1",
  email: "admin@example.com",
  display_name: "Admin",
  role: "admin" as const,
};

const memberUser = {
  id: "member-1",
  email: "member@example.com",
  display_name: "Member",
  role: "member" as const,
};

const sampleCohort = {
  id: "cohort-1",
  name: "Cohort Q1",
  start_date: "2026-01-01",
  end_date: "2026-03-31",
  member_count: 5,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function authenticateAs(user: typeof adminUser | typeof memberUser) {
  mockFirebaseToken("uid-1", user.email);
  mockFindUser.mockResolvedValue(user);
}

describe("Cohort endpoints", () => {
  beforeEach(() => {
    resetFirebaseMocks();
    mockFindUser.mockReset();
    mockListCohorts.mockReset();
    mockCreateCohort.mockReset();
    mockGetCohortById.mockReset();
    mockUpdateCohort.mockReset();
    mockListMembers.mockReset();
    mockAddMember.mockReset();
    mockRemoveMember.mockReset();
    mockIsInstructorOfCohort.mockReset();
  });

  // ── GET /cohorts ──

  describe("GET /cohorts", () => {
    it("returns cohort list", async () => {
      authenticateAs(memberUser);
      mockListCohorts.mockResolvedValue([sampleCohort]);

      const res = await request(app)
        .get("/cohorts")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.cohorts).toHaveLength(1);
      expect(res.body.cohorts[0].name).toBe("Cohort Q1");
    });

    it("returns 401 without auth", async () => {
      const res = await request(app).get("/cohorts");
      expect(res.status).toBe(401);
    });
  });

  // ── POST /cohorts ──

  describe("POST /cohorts", () => {
    it("creates cohort as admin", async () => {
      authenticateAs(adminUser);
      mockCreateCohort.mockResolvedValue({
        id: "cohort-new",
        name: "New Cohort",
        start_date: "2026-04-01",
        end_date: "2026-06-30",
        created_at: "2026-03-22T00:00:00.000Z",
      });

      const res = await request(app)
        .post("/cohorts")
        .set("Authorization", "Bearer valid-token")
        .send({ name: "New Cohort", start_date: "2026-04-01", end_date: "2026-06-30" });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe("New Cohort");
    });

    it("returns 403 for non-admin", async () => {
      authenticateAs(memberUser);

      const res = await request(app)
        .post("/cohorts")
        .set("Authorization", "Bearer valid-token")
        .send({ name: "X", start_date: "2026-01-01", end_date: "2026-03-31" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("returns 400 when end_date <= start_date", async () => {
      authenticateAs(adminUser);

      const res = await request(app)
        .post("/cohorts")
        .set("Authorization", "Bearer valid-token")
        .send({ name: "X", start_date: "2026-06-01", end_date: "2026-01-01" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when name is empty", async () => {
      authenticateAs(adminUser);

      const res = await request(app)
        .post("/cohorts")
        .set("Authorization", "Bearer valid-token")
        .send({ name: "", start_date: "2026-01-01", end_date: "2026-03-31" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for invalid date format", async () => {
      authenticateAs(adminUser);

      const res = await request(app)
        .post("/cohorts")
        .set("Authorization", "Bearer valid-token")
        .send({ name: "X", start_date: "not-a-date", end_date: "2026-03-31" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ── GET /cohorts/:id ──

  describe("GET /cohorts/:id", () => {
    it("returns cohort detail", async () => {
      authenticateAs(memberUser);
      mockGetCohortById.mockResolvedValue(sampleCohort);

      const res = await request(app)
        .get("/cohorts/cohort-1")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("cohort-1");
      expect(res.body.member_count).toBe(5);
    });

    it("returns 404 when not found", async () => {
      authenticateAs(memberUser);
      mockGetCohortById.mockResolvedValue(null);

      const res = await request(app)
        .get("/cohorts/nonexistent")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  // ── PATCH /cohorts/:id ──

  describe("PATCH /cohorts/:id", () => {
    it("updates cohort name", async () => {
      authenticateAs(adminUser);
      mockGetCohortById.mockResolvedValueOnce(sampleCohort); // existing check
      mockUpdateCohort.mockResolvedValue({ ...sampleCohort, name: "Updated" });
      mockGetCohortById.mockResolvedValueOnce({ ...sampleCohort, name: "Updated" }); // response

      const res = await request(app)
        .patch("/cohorts/cohort-1")
        .set("Authorization", "Bearer valid-token")
        .send({ name: "Updated" });

      expect(res.status).toBe(200);
      expect(mockUpdateCohort).toHaveBeenCalledWith("cohort-1", { name: "Updated" });
    });

    it("returns 403 for non-admin", async () => {
      authenticateAs(memberUser);

      const res = await request(app)
        .patch("/cohorts/cohort-1")
        .set("Authorization", "Bearer valid-token")
        .send({ name: "Updated" });

      expect(res.status).toBe(403);
    });

    it("returns 404 when cohort not found", async () => {
      authenticateAs(adminUser);
      mockGetCohortById.mockResolvedValue(null);

      const res = await request(app)
        .patch("/cohorts/nonexistent")
        .set("Authorization", "Bearer valid-token")
        .send({ name: "Updated" });

      expect(res.status).toBe(404);
    });

    it("validates date range with existing values", async () => {
      authenticateAs(adminUser);
      mockGetCohortById.mockResolvedValue(sampleCohort);

      // start_date after existing end_date
      const res = await request(app)
        .patch("/cohorts/cohort-1")
        .set("Authorization", "Bearer valid-token")
        .send({ start_date: "2026-12-01" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ── GET /cohorts/:id/members ──

  describe("GET /cohorts/:id/members", () => {
    it("returns members for admin", async () => {
      authenticateAs(adminUser);
      mockGetCohortById.mockResolvedValue(sampleCohort);
      mockListMembers.mockResolvedValue([
        { user_id: "u1", email: "a@x.com", display_name: "Alice", role_in_cohort: "student", created_at: "2026-01-01T00:00:00.000Z" },
      ]);

      const res = await request(app)
        .get("/cohorts/cohort-1/members")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.members).toHaveLength(1);
    });

    it("returns members for instructor of cohort", async () => {
      authenticateAs(memberUser);
      mockGetCohortById.mockResolvedValue(sampleCohort);
      mockIsInstructorOfCohort.mockResolvedValue(true);
      mockListMembers.mockResolvedValue([]);

      const res = await request(app)
        .get("/cohorts/cohort-1/members")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
    });

    it("returns 403 for student", async () => {
      authenticateAs(memberUser);
      mockGetCohortById.mockResolvedValue(sampleCohort);
      mockIsInstructorOfCohort.mockResolvedValue(false);

      const res = await request(app)
        .get("/cohorts/cohort-1/members")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });

    it("returns 404 when cohort not found", async () => {
      authenticateAs(adminUser);
      mockGetCohortById.mockResolvedValue(null);

      const res = await request(app)
        .get("/cohorts/nonexistent/members")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });
  });

  // ── POST /cohorts/:id/members ──

  describe("POST /cohorts/:id/members", () => {
    it("adds a member", async () => {
      authenticateAs(adminUser);
      mockGetCohortById.mockResolvedValue(sampleCohort);
      mockAddMember.mockResolvedValue({
        data: { user_id: "u1", cohort_id: "cohort-1", role_in_cohort: "student", created_at: "2026-03-22T00:00:00.000Z" },
      });

      const res = await request(app)
        .post("/cohorts/cohort-1/members")
        .set("Authorization", "Bearer valid-token")
        .send({ user_id: "a0000000-0000-4000-8000-000000000001", role_in_cohort: "student" });

      expect(res.status).toBe(201);
      expect(res.body.role_in_cohort).toBe("student");
    });

    it("returns 403 for non-admin", async () => {
      authenticateAs(memberUser);

      const res = await request(app)
        .post("/cohorts/cohort-1/members")
        .set("Authorization", "Bearer valid-token")
        .send({ user_id: "a0000000-0000-4000-8000-000000000001", role_in_cohort: "student" });

      expect(res.status).toBe(403);
    });

    it("returns 404 when cohort not found", async () => {
      authenticateAs(adminUser);
      mockGetCohortById.mockResolvedValue(null);

      const res = await request(app)
        .post("/cohorts/nonexistent/members")
        .set("Authorization", "Bearer valid-token")
        .send({ user_id: "a0000000-0000-4000-8000-000000000001", role_in_cohort: "student" });

      expect(res.status).toBe(404);
    });

    it("returns 404 when user not found", async () => {
      authenticateAs(adminUser);
      mockGetCohortById.mockResolvedValue(sampleCohort);
      mockAddMember.mockResolvedValue({ error: "USER_NOT_FOUND" });

      const res = await request(app)
        .post("/cohorts/cohort-1/members")
        .set("Authorization", "Bearer valid-token")
        .send({ user_id: "a0000000-0000-4000-8000-000000000001", role_in_cohort: "student" });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("USER_NOT_FOUND");
    });

    it("returns 409 when already a member", async () => {
      authenticateAs(adminUser);
      mockGetCohortById.mockResolvedValue(sampleCohort);
      mockAddMember.mockRejectedValue(new MemberAlreadyExistsError());

      const res = await request(app)
        .post("/cohorts/cohort-1/members")
        .set("Authorization", "Bearer valid-token")
        .send({ user_id: "a0000000-0000-4000-8000-000000000001", role_in_cohort: "student" });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ALREADY_MEMBER");
    });

    it("returns 400 for invalid role_in_cohort", async () => {
      authenticateAs(adminUser);

      const res = await request(app)
        .post("/cohorts/cohort-1/members")
        .set("Authorization", "Bearer valid-token")
        .send({ user_id: "a0000000-0000-4000-8000-000000000001", role_in_cohort: "invalid" });

      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /cohorts/:id/members/:user_id ──

  describe("DELETE /cohorts/:id/members/:user_id", () => {
    it("removes a member", async () => {
      authenticateAs(adminUser);
      mockGetCohortById.mockResolvedValue(sampleCohort);
      mockRemoveMember.mockResolvedValue(true);

      const res = await request(app)
        .delete("/cohorts/cohort-1/members/user-1")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(204);
    });

    it("returns 403 for non-admin", async () => {
      authenticateAs(memberUser);

      const res = await request(app)
        .delete("/cohorts/cohort-1/members/user-1")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });

    it("returns 404 when cohort not found", async () => {
      authenticateAs(adminUser);
      mockGetCohortById.mockResolvedValue(null);

      const res = await request(app)
        .delete("/cohorts/nonexistent/members/user-1")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("returns 404 when membership not found", async () => {
      authenticateAs(adminUser);
      mockGetCohortById.mockResolvedValue(sampleCohort);
      mockRemoveMember.mockResolvedValue(false);

      const res = await request(app)
        .delete("/cohorts/cohort-1/members/user-1")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });
  });
});
