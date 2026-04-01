import type { Events, EventMessage } from "../protocol/index.js";
import type * as vscode from "vscode";

type Subscriber = {
  id: string;
  send: (msg: EventMessage) => void;
};

export class EventBus {
  private subscribers = new Map<string, Subscriber>();

  subscribe(id: string, webview: vscode.Webview): () => void {
    this.subscribers.set(id, {
      id,
      send: (msg) => void webview.postMessage(msg),
    });
    return () => this.subscribers.delete(id);
  }

  emit<E extends keyof Events>(event: E, payload: Events[E]): void {
    const msg: EventMessage = { type: "event", event, payload };
    for (const sub of this.subscribers.values()) {
      sub.send(msg);
    }
  }
}
