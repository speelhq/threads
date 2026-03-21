import { vi } from "vitest";

// Mock Firebase Admin SDK before any imports
vi.mock("firebase-admin", () => {
  const mockAuth = {
    verifyIdToken: vi.fn(),
  };
  return {
    default: {
      initializeApp: vi.fn(() => ({
        auth: () => mockAuth,
      })),
      credential: {
        applicationDefault: vi.fn(),
      },
    },
  };
});

vi.mock("firebase-admin/auth", () => ({
  Auth: vi.fn(),
}));
