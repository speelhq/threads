import * as vscode from "vscode";
import type {
  RequestMessage,
  ResponseMessage,
  EventMessage,
} from "../protocol/index.js";
import type { AuthManager } from "./auth.js";
import type { ApiClient } from "./api.js";

type CommandHandler = (payload: unknown) => Promise<unknown>;

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private handlers = new Map<string, CommandHandler>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly authManager: AuthManager,
    private readonly apiClient: ApiClient,
  ) {
    this.registerHandlers();
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "dist", "webview"),
      ],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: RequestMessage) => {
      if (msg.type !== "request") return;
      void this.handleRequest(webviewView.webview, msg);
    });

    // Send current auth state when webview becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.pushAuthState();
      }
    });
  }

  pushEvent(event: string, payload: unknown): void {
    const msg: EventMessage = { type: "event", event, payload };
    void this.view?.webview.postMessage(msg);
  }

  private pushAuthState(): void {
    // Will be populated with real data by the auth state listener
    this.pushEvent("auth.stateChanged", {
      state: this.authManager.getState(),
    });
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
    // Auth
    this.handlers.set("auth.login", async () => {
      void vscode.commands.executeCommand("threads.login");
    });
    this.handlers.set("auth.logout", async () => {
      void vscode.commands.executeCommand("threads.logout");
    });

    // Threads
    this.handlers.set("threads.list", async (p) => {
      const params = p as { tagId?: string; search?: string; cursor?: string; limit?: number } | undefined;
      return this.apiClient.listThreads(params);
    });
    this.handlers.set("threads.create", async (p) => {
      const body = p as { title: string; tag_ids?: string[] };
      return this.apiClient.createThread(body);
    });
    this.handlers.set("threads.update", async (p) => {
      const body = p as { id: string; title?: string; pinned?: boolean };
      return this.apiClient.updateThread(body.id, body);
    });
    this.handlers.set("threads.delete", async (p) => {
      const body = p as { id: string };
      return this.apiClient.deleteThread(body.id);
    });

    // Cross-thread TODOs
    this.handlers.set("todos.listCrossThread", async (p) => {
      const params = p as { completed: boolean; cursor?: string; limit?: number };
      return this.apiClient.listCrossThreadTodos(params);
    });
    this.handlers.set("todos.update", async (p) => {
      const body = p as { id: string; content?: string; completed?: boolean };
      return this.apiClient.updateTodo(body.id, body);
    });

    // Tags
    this.handlers.set("tags.list", async (p) => {
      const params = p as { cohortId: string };
      return this.apiClient.listTags(params);
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "sidebar.js"),
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Threads</title>
  <style>
    body {
      padding: 0;
      margin: 0;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
