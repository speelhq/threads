import * as vscode from "vscode";
import type {
  RequestMessage,
  ResponseMessage,
  EventMessage,
} from "../protocol/index.js";
import type { ApiClient } from "./api.js";

type CommandHandler = (payload: unknown) => Promise<unknown>;

export class EditorManager {
  private panels = new Map<string, vscode.WebviewPanel>();
  private handlers = new Map<string, CommandHandler>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly apiClient: ApiClient,
  ) {
    this.registerHandlers();
  }

  openThread(threadId: string, title: string): void {
    const existing = this.panels.get(threadId);
    if (existing) {
      existing.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "threads.editor",
      title,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, "dist", "webview"),
        ],
        retainContextWhenHidden: true,
      },
    );

    panel.webview.html = this.getHtml(panel.webview, threadId);

    panel.webview.onDidReceiveMessage((msg: RequestMessage) => {
      if (msg.type !== "request") return;
      void this.handleRequest(panel.webview, msg);
    });

    panel.onDidDispose(() => {
      this.panels.delete(threadId);
    });

    this.panels.set(threadId, panel);
  }

  pushEvent(event: string, payload: unknown): void {
    const msg: EventMessage = { type: "event", event, payload };
    for (const panel of this.panels.values()) {
      void panel.webview.postMessage(msg);
    }
  }

  private async handleRequest(
    webview: vscode.Webview,
    msg: RequestMessage,
  ): Promise<void> {
    const handler = this.handlers.get(msg.command);
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
      const error =
        err instanceof Error
          ? { code: (err as { code?: string }).code ?? "UNKNOWN", message: err.message }
          : { code: "UNKNOWN", message: String(err) };
      const res: ResponseMessage = { type: "response", id: msg.id, error };
      void webview.postMessage(res);
    }
  }

  private registerHandlers(): void {
    // Thread
    this.handlers.set("threads.get", async (p) => {
      const { id } = p as { id: string };
      return this.apiClient.getThread(id);
    });
    this.handlers.set("threads.update", async (p) => {
      const body = p as { id: string; title?: string; pinned?: boolean };
      return this.apiClient.updateThread(body.id, body);
    });
    this.handlers.set("threads.delete", async (p) => {
      const { id } = p as { id: string };
      return this.apiClient.deleteThread(id);
    });

    // Messages
    this.handlers.set("messages.create", async (p) => {
      const { threadId, body } = p as { threadId: string; body: string };
      return this.apiClient.createMessage(threadId, { body });
    });
    this.handlers.set("messages.update", async (p) => {
      const { id, body } = p as { id: string; body: string };
      return this.apiClient.updateMessage(id, { body });
    });
    this.handlers.set("messages.delete", async (p) => {
      const { id } = p as { id: string };
      return this.apiClient.deleteMessage(id);
    });
    this.handlers.set("messages.reorder", async (p) => {
      const { threadId, messageIds } = p as { threadId: string; messageIds: string[] };
      return this.apiClient.reorderMessages(threadId, { message_ids: messageIds });
    });

    // TODOs
    this.handlers.set("todos.create", async (p) => {
      const { threadId, content } = p as { threadId: string; content: string };
      return this.apiClient.createTodo(threadId, { content });
    });
    this.handlers.set("todos.update", async (p) => {
      const body = p as { id: string; content?: string; completed?: boolean };
      return this.apiClient.updateTodo(body.id, body);
    });
    this.handlers.set("todos.delete", async (p) => {
      const { id } = p as { id: string };
      return this.apiClient.deleteTodo(id);
    });

    // Bookmarks
    this.handlers.set("bookmarks.create", async (p) => {
      const { threadId, url } = p as { threadId: string; url: string };
      return this.apiClient.createBookmark(threadId, { url });
    });
    this.handlers.set("bookmarks.update", async (p) => {
      const body = p as { id: string; title?: string; description?: string };
      return this.apiClient.updateBookmark(body.id, body);
    });
    this.handlers.set("bookmarks.delete", async (p) => {
      const { id } = p as { id: string };
      return this.apiClient.deleteBookmark(id);
    });

    // Tags on thread
    this.handlers.set("threads.addTag", async (p) => {
      const { threadId, tagId } = p as { threadId: string; tagId: string };
      return this.apiClient.addThreadTag(threadId, tagId);
    });
    this.handlers.set("threads.removeTag", async (p) => {
      const { threadId, tagId } = p as { threadId: string; tagId: string };
      return this.apiClient.removeThreadTag(threadId, tagId);
    });
    this.handlers.set("tags.list", async (p) => {
      const params = p as { cohortId: string };
      return this.apiClient.listTags(params);
    });
  }

  private getHtml(webview: vscode.Webview, threadId: string): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "editor.js"),
    );
    const csp = `default-src 'none'; script-src ${webview.cspSource}; style-src 'unsafe-inline';`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Thread</title>
  <style>
    body {
      padding: 0;
      margin: 0;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
  </style>
</head>
<body>
  <div id="root" data-thread-id="${threadId}"></div>
  <script type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
