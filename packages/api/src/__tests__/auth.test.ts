import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import {
  mockFirebaseToken,
  mockFirebaseTokenInvalid,
  resetFirebaseMocks,
} from "./helpers.js";

// Mock the auth service (resolveUser now uses findUserByExternalId internally)
vi.mock("../services/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/auth.js")>();
  return {
    ...actual,
    findUserByExternalId: vi.fn(),
    createUser: vi.fn(),
    getUserWithCohorts: vi.fn(),
  };
});

import {
  findUserByExternalId,
  createUser,
  getUserWithCohorts,
  EmailAlreadyExistsError,
} from "../services/auth.js";

const mockFindUser = findUserByExternalId as ReturnType<typeof vi.fn>;
const mockCreateUser = createUser as ReturnType<typeof vi.fn>;
const mockGetUserWithCohorts = getUserWithCohorts as ReturnType<typeof vi.fn>;

describe("Auth endpoints", () => {
  beforeEach(() => {
    resetFirebaseMocks();
    mockFindUser.mockReset();
    mockCreateUser.mockReset();
    mockGetUserWithCohorts.mockReset();
  });

  // ── Token verification (shared by all endpoints) ──

  describe("token verification", () => {
    it("returns 401 UNAUTHORIZED when no Authorization header", async () => {
      const res = await request(app).post("/auth/signup").send({ display_name: "Test" });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 401 UNAUTHORIZED when header format is invalid", async () => {
      const res = await request(app)
        .post("/auth/signup")
        .set("Authorization", "InvalidFormat")
        .send({ display_name: "Test" });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 401 TOKEN_EXPIRED when token is invalid", async () => {
      mockFirebaseTokenInvalid();
      const res = await request(app)
        .post("/auth/signup")
        .set("Authorization", "Bearer invalid-token")
        .send({ display_name: "Test" });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("TOKEN_EXPIRED");
    });
  });

  // ── POST /auth/signup ──

  describe("POST /auth/signup", () => {
    it("creates a user with display_name from body", async () => {
      mockFirebaseToken("firebase-uid-1", "test@example.com", "Google Name");
      mockFindUser.mockResolvedValue(null);
      mockCreateUser.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        display_name: "Body Name",
        role: "member",
        created_at: "2026-03-21T00:00:00.000Z",
      });

      const res = await request(app)
        .post("/auth/signup")
        .set("Authorization", "Bearer valid-token")
        .send({ display_name: "Body Name" });

      expect(res.status).toBe(201);
      expect(mockCreateUser).toHaveBeenCalledWith({
        email: "test@example.com",
        display_name: "Body Name",
        external_auth_id: "firebase-uid-1",
      });
    });

    it("falls back to token name when display_name is not in body", async () => {
      mockFirebaseToken("firebase-uid-1", "test@example.com", "Google Name");
      mockFindUser.mockResolvedValue(null);
      mockCreateUser.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        display_name: "Google Name",
        role: "member",
        created_at: "2026-03-21T00:00:00.000Z",
      });

      const res = await request(app)
        .post("/auth/signup")
        .set("Authorization", "Bearer valid-token")
        .send({});

      expect(res.status).toBe(201);
      expect(mockCreateUser).toHaveBeenCalledWith({
        email: "test@example.com",
        display_name: "Google Name",
        external_auth_id: "firebase-uid-1",
      });
    });

    it("returns 400 when display_name is in neither body nor token", async () => {
      mockFirebaseToken("firebase-uid-1", "test@example.com");

      const res = await request(app)
        .post("/auth/signup")
        .set("Authorization", "Bearer valid-token")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 409 when user already exists", async () => {
      mockFirebaseToken("firebase-uid-1", "test@example.com", "Google Name");
      mockFindUser.mockResolvedValue({ id: "existing-user" });

      const res = await request(app)
        .post("/auth/signup")
        .set("Authorization", "Bearer valid-token")
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("USER_ALREADY_EXISTS");
    });

    it("returns 409 on race condition (createUser returns null)", async () => {
      mockFirebaseToken("firebase-uid-1", "test@example.com", "Google Name");
      mockFindUser.mockResolvedValue(null);
      mockCreateUser.mockResolvedValue(null);

      const res = await request(app)
        .post("/auth/signup")
        .set("Authorization", "Bearer valid-token")
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("USER_ALREADY_EXISTS");
    });

    it("returns 400 when display_name is empty string", async () => {
      mockFirebaseToken("firebase-uid-1", "test@example.com");

      const res = await request(app)
        .post("/auth/signup")
        .set("Authorization", "Bearer valid-token")
        .send({ display_name: "" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 409 EMAIL_ALREADY_EXISTS when email is taken by another uid", async () => {
      mockFirebaseToken("firebase-uid-1", "test@example.com", "Google Name");
      mockFindUser.mockResolvedValue(null);
      mockCreateUser.mockRejectedValue(new EmailAlreadyExistsError());

      const res = await request(app)
        .post("/auth/signup")
        .set("Authorization", "Bearer valid-token")
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
    });

    it("returns 400 when display_name exceeds 100 characters", async () => {
      mockFirebaseToken("firebase-uid-1", "test@example.com");

      const res = await request(app)
        .post("/auth/signup")
        .set("Authorization", "Bearer valid-token")
        .send({ display_name: "a".repeat(101) });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ── POST /auth/login ──

  describe("POST /auth/login", () => {
    it("returns 401 USER_NOT_FOUND when user does not exist", async () => {
      mockFirebaseToken("firebase-uid-1", "test@example.com");
      mockFindUser.mockResolvedValue(null);

      const res = await request(app)
        .post("/auth/login")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("USER_NOT_FOUND");
    });

    it("returns user with cohorts", async () => {
      mockFirebaseToken("firebase-uid-1", "test@example.com");
      mockFindUser.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        display_name: "Test User",
        role: "member",
      });
      mockGetUserWithCohorts.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        display_name: "Test User",
        role: "member",
        created_at: "2026-03-21T00:00:00.000Z",
        cohorts: [
          {
            cohort_id: "cohort-1",
            name: "Cohort 1",
            role_in_cohort: "student",
            start_date: "2026-01-01",
            end_date: "2026-06-30",
          },
        ],
      });

      const res = await request(app)
        .post("/auth/login")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(mockFindUser).toHaveBeenCalledWith("firebase-uid-1");
      expect(mockGetUserWithCohorts).toHaveBeenCalledWith("user-1");
      expect(res.body.email).toBe("test@example.com");
      expect(res.body.cohorts).toHaveLength(1);
      expect(res.body.cohorts[0].role_in_cohort).toBe("student");
    });
  });

  // ── GET /auth/me ──

  describe("GET /auth/me", () => {
    it("returns user with cohorts", async () => {
      mockFirebaseToken("firebase-uid-1", "test@example.com");
      mockFindUser.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        display_name: "Test User",
        role: "member",
      });
      mockGetUserWithCohorts.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        display_name: "Test User",
        role: "member",
        created_at: "2026-03-21T00:00:00.000Z",
        cohorts: [],
      });

      const res = await request(app)
        .get("/auth/me")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(mockFindUser).toHaveBeenCalledWith("firebase-uid-1");
      expect(mockGetUserWithCohorts).toHaveBeenCalledWith("user-1");
      expect(res.body.email).toBe("test@example.com");
      expect(res.body.cohorts).toHaveLength(0);
    });
  });
});
