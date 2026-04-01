import { describe, it, expect, vi } from "vitest";
import { handleRequest } from "../extension/handlers.js";
import { ApiError } from "../extension/api.js";
import type { HandlerMap } from "../extension/handlers.js";
import type { RequestMessage } from "../protocol/index.js";
import type * as vscode from "vscode";

function mockWebview(): vscode.Webview & { postMessage: ReturnType<typeof vi.fn> } {
  return { postMessage: vi.fn() } as unknown as vscode.Webview & {
    postMessage: ReturnType<typeof vi.fn>;
  };
}

function makeRequest(command: string, payload?: unknown): RequestMessage {
  return { type: "request", id: "req-1", command, payload };
}

describe("handleRequest", () => {
  it("sends response with handler return value", async () => {
    const webview = mockWebview();
    const handlers: HandlerMap = {
      "threads.get": async (p) => ({
        id: p.id,
        title: "Test",
        workspaceId: "w1",
        pinnedAt: null,
        tags: [],
        messages: [],
        todos: [],
        bookmarks: [],
        createdAt: "",
        updatedAt: "",
      }),
    };

    await handleRequest(handlers, webview, makeRequest("threads.get", { id: "t1" }));

    expect(webview.postMessage).toHaveBeenCalledOnce();
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: "response",
      id: "req-1",
      data: expect.objectContaining({ id: "t1", title: "Test" }),
    });
  });

  it("sends UNKNOWN_COMMAND error for unregistered command", async () => {
    const webview = mockWebview();

    await handleRequest({}, webview, makeRequest("nonexistent.command"));

    expect(webview.postMessage).toHaveBeenCalledOnce();
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: "response",
      id: "req-1",
      error: { code: "UNKNOWN_COMMAND", message: "Unknown command: nonexistent.command" },
    });
  });

  it("sends structured error for ApiError", async () => {
    const webview = mockWebview();
    const handlers: HandlerMap = {
      "threads.get": async () => {
        throw new ApiError(404, "NOT_FOUND", "Thread not found");
      },
    };

    await handleRequest(handlers, webview, makeRequest("threads.get", { id: "t1" }));

    expect(webview.postMessage).toHaveBeenCalledOnce();
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: "response",
      id: "req-1",
      error: { code: "NOT_FOUND", message: "Thread not found" },
    });
  });

  it("sends UNKNOWN error for generic Error", async () => {
    const webview = mockWebview();
    const handlers: HandlerMap = {
      "threads.get": async () => {
        throw new Error("something broke");
      },
    };

    await handleRequest(handlers, webview, makeRequest("threads.get", { id: "t1" }));

    expect(webview.postMessage).toHaveBeenCalledOnce();
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: "response",
      id: "req-1",
      error: { code: "UNKNOWN", message: "something broke" },
    });
  });

  it("sends UNKNOWN error for non-Error throw", async () => {
    const webview = mockWebview();
    const handlers: HandlerMap = {
      "threads.get": async () => {
        throw "string error";
      },
    };

    await handleRequest(handlers, webview, makeRequest("threads.get", { id: "t1" }));

    expect(webview.postMessage).toHaveBeenCalledOnce();
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: "response",
      id: "req-1",
      error: { code: "UNKNOWN", message: "string error" },
    });
  });
});
