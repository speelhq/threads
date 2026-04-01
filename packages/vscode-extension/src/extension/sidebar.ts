import * as vscode from "vscode";
import type { RequestMessage } from "../protocol/index.js";
import type { AuthManager } from "./auth.js";
import type { IApiClient } from "./api.js";
import type { EditorManager } from "./editor.js";
import type { EventBus } from "./event-bus.js";
import { createSharedHandlers, mergeHandlers, handleRequest } from "./handlers.js";
import type { HandlerMap } from "./handlers.js";

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private handlers: HandlerMap;
  private unsubscribeEventBus: (() => void) | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly authManager: AuthManager,
    private readonly apiClient: IApiClient,
    private readonly eventBus: EventBus,
    private readonly editorManager: EditorManager,
  ) {
    this.handlers = mergeHandlers(
      createSharedHandlers(apiClient, eventBus),
      this.createSidebarHandlers(),
    );
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
      void handleRequest(this.handlers, webviewView.webview, msg);
    });

    // Subscribe to event bus (unsubscribe previous if re-resolved)
    this.unsubscribeEventBus?.();
    this.unsubscribeEventBus = this.eventBus.subscribe("sidebar", webviewView.webview);

    // Re-send auth state when sidebar becomes visible again
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.pushAuthState();
      }
    });
  }

  private pushAuthState(): void {
    this.eventBus.emit("auth.stateChanged", this.authManager.getLastPayload());
  }

  private createSidebarHandlers(): HandlerMap {
    return {
      "auth.getState": async () => this.authManager.getLastPayload(),
      "auth.login": async () => { void vscode.commands.executeCommand("threads.login"); },
      "auth.logout": async () => { void vscode.commands.executeCommand("threads.logout"); },
      "threads.open": async (p) => { this.editorManager.openThread(p.id, p.title); },
      "threads.delete": async (p) => {
        const answer = await vscode.window.showWarningMessage(
          "このスレッドと配下のメッセージ・TODO・ブックマークが全て削除されます。",
          { modal: true },
          "削除",
        );
        if (answer !== "削除") return;
        await this.apiClient.deleteThread(p.id);
        this.eventBus.emit("threads.deleted", { id: p.id });
      },
    };
  }

  private getHtml(webview: vscode.Webview): string {
    const distWebview = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distWebview, "sidebar.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distWebview, "assets", "jsx-runtime.css"));
    const codiconUri = webview.asWebviewUri(vscode.Uri.joinPath(distWebview, "assets", "codicon.css"));
    const csp = `default-src 'none'; script-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource};`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Threads</title>
  <link rel="stylesheet" href="${codiconUri}" />
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
