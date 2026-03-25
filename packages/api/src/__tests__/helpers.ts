import { vi } from "vitest";
import { auth } from "../middleware/firebase.js";

const mockVerifyIdToken = auth.verifyIdToken as ReturnType<typeof vi.fn>;

/**
 * Configure the Firebase mock to return a valid decoded token.
 */
export function mockFirebaseToken(
  uid: string,
  email: string,
  name?: string,
) {
  mockVerifyIdToken.mockResolvedValue({ uid, email, name });
}

/**
 * Configure the Firebase mock to reject the token.
 */
export function mockFirebaseTokenInvalid() {
  mockVerifyIdToken.mockRejectedValue(new Error("Token is invalid"));
}

/**
 * Reset all Firebase mocks.
 */
export function resetFirebaseMocks() {
  mockVerifyIdToken.mockReset();
}
