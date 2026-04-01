import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../extension/event-bus.js";
import type * as vscode from "vscode";

function mockWebview(): vscode.Webview {
  return { postMessage: vi.fn() } as unknown as vscode.Webview;
}

describe("EventBus", () => {
  it("delivers event to subscriber", () => {
    const bus = new EventBus();
    const webview = mockWebview();
    bus.subscribe("sub-1", webview);

    bus.emit("threads.created", {
      id: "t1",
      title: "Test",
      pinnedAt: null,
      tags: [],
      incompleteTodoCount: 0,
      createdAt: "",
      updatedAt: "",
    });

    expect(webview.postMessage).toHaveBeenCalledWith({
      type: "event",
      event: "threads.created",
      payload: expect.objectContaining({ id: "t1", title: "Test" }),
    });
  });

  it("delivers event to multiple subscribers", () => {
    const bus = new EventBus();
    const w1 = mockWebview();
    const w2 = mockWebview();
    bus.subscribe("sub-1", w1);
    bus.subscribe("sub-2", w2);

    bus.emit("threads.deleted", { id: "t1" });

    expect(w1.postMessage).toHaveBeenCalledOnce();
    expect(w2.postMessage).toHaveBeenCalledOnce();
  });

  it("does not deliver after unsubscribe", () => {
    const bus = new EventBus();
    const webview = mockWebview();
    const unsub = bus.subscribe("sub-1", webview);

    unsub();
    bus.emit("threads.deleted", { id: "t1" });

    expect(webview.postMessage).not.toHaveBeenCalled();
  });

  it("does not error when emitting with no subscribers", () => {
    const bus = new EventBus();
    expect(() => bus.emit("threads.deleted", { id: "t1" })).not.toThrow();
  });

  it("overwrites subscriber with same ID", () => {
    const bus = new EventBus();
    const w1 = mockWebview();
    const w2 = mockWebview();
    bus.subscribe("same-id", w1);
    bus.subscribe("same-id", w2);

    bus.emit("threads.deleted", { id: "t1" });

    expect(w1.postMessage).not.toHaveBeenCalled();
    expect(w2.postMessage).toHaveBeenCalledOnce();
  });
});
