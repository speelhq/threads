import { useState, useCallback } from "react";
import type {
  Commands,
  Events,
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
const eventListeners = new Map<string, Set<(payload: unknown) => void>>();

export function onEvent<E extends keyof Events>(
  event: E,
  fn: (payload: Events[E]) => void,
): () => void {
  let set = eventListeners.get(event);
  if (!set) {
    set = new Set();
    eventListeners.set(event, set);
  }
  set.add(fn as (payload: unknown) => void);
  return () => {
    set!.delete(fn as (payload: unknown) => void);
  };
}

// Send a request and wait for response
function sendCommand<C extends keyof Commands>(
  command: C,
  payload: Commands[C]["payload"],
): Promise<Commands[C]["response"]> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (data: unknown) => void,
      reject,
    });
    const msg: RequestMessage = { type: "request", id, command, payload };
    vscode.postMessage(msg);
  });
}

export function useCommand<C extends keyof Commands>(command: C) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const execute = useCallback(
    async (payload: Commands[C]["payload"]): Promise<Commands[C]["response"]> => {
      setLoading(true);
      setError(null);
      try {
        const result = await sendCommand(command, payload);
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
