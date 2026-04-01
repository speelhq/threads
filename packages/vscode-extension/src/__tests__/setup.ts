import { vi } from "vitest";

vi.mock("vscode", () => ({
  Uri: { joinPath: vi.fn() },
  window: { showWarningMessage: vi.fn() },
}));
