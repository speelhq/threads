import { useState, useCallback } from "react";
import type {
  RequestMessage,
  ResponseMessage,
  EventMessage,
} from "../../protocol/index.js";

type VsCodeApi = {
  postMessage(msg: unknown): void;
};

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

type PendingRequest = {
  resolve: (data: unknown) => void;
  reject: (err: { code: string; message: string }) => void;
};

const pending = new Map<string, PendingRequest>();

// Listen for responses and events from Extension Host
window.addEventListener("message", (e: MessageEvent) => {
  const msg = e.data as ResponseMessage | EventMessage;

  if (msg.type === "response") {
    const req = pending.get(msg.id);
    if (!req) return;
    pending.delete(msg.id);
    if (msg.error) {
      req.reject(msg.error);
    } else {
      req.resolve(msg.data);
    }
  }

  if (msg.type === "event") {
    const listeners = eventListeners.get(msg.event);
    if (listeners) {
      for (const fn of listeners) {
        fn(msg.payload);
      }
    }
  }
});

// Event listener registry
type EventListener = (payload: unknown) => void;
const eventListeners = new Map<string, Set<EventListener>>();

export function onEvent(event: string, fn: EventListener): () => void {
  let set = eventListeners.get(event);
  if (!set) {
    set = new Set();
    eventListeners.set(event, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}

// Send a request and wait for response
function sendCommand<T>(command: string, payload?: unknown): Promise<T> {
  const id = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (data: unknown) => void,
      reject,
    });
    const msg: RequestMessage = { type: "request", id, command, payload };
    vscode.postMessage(msg);
  });
}

export function useCommand<T>(command: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(
    null,
  );

  const execute = useCallback(
    async (payload?: unknown): Promise<T> => {
      setLoading(true);
      setError(null);
      try {
        const result = await sendCommand<T>(command, payload);
        return result;
      } catch (err) {
        const e = err as { code: string; message: string };
        setError(e);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [command],
  );

  return { execute, loading, error };
}
