import * as vscode from "vscode";
import type { Commands, RequestMessage, ResponseMessage } from "../protocol/index.js";
import { ApiError } from "./api.js";
import type { IApiClient } from "./api.js";
import type { EventBus } from "./event-bus.js";

// ── Type-safe handler types ──

type Handler<C extends keyof Commands> = (
  payload: Commands[C]["payload"],
) => Promise<Commands[C]["response"]>;

export type HandlerMap = {
  [C in keyof Commands]?: Handler<C>;
};

// ── Shared handlers ──

export function createSharedHandlers(
  apiClient: IApiClient,
  eventBus: EventBus,
): HandlerMap {
  return {
    // Threads
    "threads.list": async (p) => apiClient.listThreads(p),
    "threads.get": async (p) => apiClient.getThread(p.id),
    "threads.create": async (p) => {
      const result = await apiClient.createThread({ title: p.title, tag_ids: p.tagIds });
      eventBus.emit("threads.created", result);
      return result;
    },
    "threads.update": async (p) => {
      const result = await apiClient.updateThread(p.id, { title: p.title, pinned: p.pinned });
      eventBus.emit("threads.updated", result);
      return result;
    },

    // Messages
    "messages.create": async (p) => apiClient.createMessage(p.threadId, { body: p.body }),
    "messages.update": async (p) => apiClient.updateMessage(p.id, { body: p.body }),
    "messages.reorder": async (p) => apiClient.reorderMessages(p.threadId, { message_ids: p.messageIds }),

    // TODOs
    "todos.listCrossThread": async (p) => apiClient.listCrossThreadTodos(p),
    "todos.create": async (p) => apiClient.createTodo(p.threadId, { content: p.content }),
    "todos.update": async (p) => apiClient.updateTodo(p.id, { content: p.content, completed: p.completed }),
    "todos.delete": async (p) => apiClient.deleteTodo(p.id),

    // Bookmarks
    "bookmarks.create": async (p) => apiClient.createBookmark(p.threadId, { url: p.url }),
    "bookmarks.update": async (p) => apiClient.updateBookmark(p.id, { title: p.title, description: p.description }),
    "bookmarks.delete": async (p) => apiClient.deleteBookmark(p.id),

    // Tags
    "tags.list": async (p) => apiClient.listTags(p),
    "tags.create": async (p) => apiClient.createTag(p),
    "threads.addTag": async (p) => apiClient.addThreadTag(p.threadId, p.tagId),
    "threads.removeTag": async (p) => apiClient.removeThreadTag(p.threadId, p.tagId),
  };
}

// ── Handler utilities ──

export function mergeHandlers(...maps: HandlerMap[]): HandlerMap {
  return Object.assign({}, ...maps);
}

export async function handleRequest(
  handlers: HandlerMap,
  webview: vscode.Webview,
  msg: RequestMessage,
): Promise<void> {
  const handler = (handlers as Record<string, ((p: unknown) => Promise<unknown>) | undefined>)[msg.command];
  if (!handler) {
    const res: ResponseMessage = {
      type: "response",
      id: msg.id,
      error: { code: "UNKNOWN_COMMAND", message: `Unknown command: ${msg.command}` },
    };
    void webview.postMessage(res);
    return;
  }

  try {
    const data = await handler(msg.payload);
    const res: ResponseMessage = { type: "response", id: msg.id, data };
    void webview.postMessage(res);
  } catch (err) {
    let error: { code: string; message: string };
    if (err instanceof ApiError) {
      error = { code: err.code, message: err.message };
    } else if (err instanceof Error) {
      error = { code: "UNKNOWN", message: err.message };
    } else {
      error = { code: "UNKNOWN", message: String(err) };
    }
    const res: ResponseMessage = { type: "response", id: msg.id, error };
    void webview.postMessage(res);
  }
}
