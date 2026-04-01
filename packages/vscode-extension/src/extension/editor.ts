import * as vscode from "vscode";
import type { RequestMessage } from "../protocol/index.js";
import type { IApiClient } from "./api.js";
import type { EventBus } from "./event-bus.js";
import { createSharedHandlers, mergeHandlers, handleRequest } from "./handlers.js";
import type { HandlerMap } from "./handlers.js";

export class EditorManager {
  private panels = new Map<string, vscode.WebviewPanel>();
  private handlers: HandlerMap;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly apiClient: IApiClient,
    private readonly eventBus: EventBus,
  ) {
    this.handlers = mergeHandlers(
      createSharedHandlers(apiClient, eventBus),
      this.createEditorHandlers(),
    );
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
      void handleRequest(this.handlers, panel.webview, msg);
    });

    // Subscribe to event bus; unsubscribe on dispose
    const unsubscribe = this.eventBus.subscribe(threadId, panel.webview);
    panel.onDidDispose(() => {
      unsubscribe();
      this.panels.delete(threadId);
    });

    this.panels.set(threadId, panel);
  }

  private createEditorHandlers(): HandlerMap {
    return {
      "threads.delete": async (p) => {
        const answer = await vscode.window.showWarningMessage(
          "このスレッドと配下のメッセージ・TODO・ブックマークが全て削除されます。",
          { modal: true },
          "削除",
        );
        if (answer !== "削除") return;
        await this.apiClient.deleteThread(p.id);
        this.eventBus.emit("threads.deleted", { id: p.id });
        const panel = this.panels.get(p.id);
        if (panel) {
          panel.dispose();
        }
      },
      "messages.delete": async (p) => {
        const answer = await vscode.window.showWarningMessage(
          "このメッセージを削除しますか？",
          { modal: true },
          "削除",
        );
        if (answer !== "削除") return;
        return this.apiClient.deleteMessage(p.id);
      },
    };
  }

  private getHtml(webview: vscode.Webview, threadId: string): string {
    const distWebview = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distWebview, "editor.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distWebview, "assets", "jsx-runtime.css"));
    const codiconUri = webview.asWebviewUri(vscode.Uri.joinPath(distWebview, "assets", "codicon.css"));
    const csp = `default-src 'none'; script-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource};`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Thread</title>
  <link rel="stylesheet" href="${codiconUri}" />
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div id="root" data-thread-id="${threadId.replace(/"/g, "&quot;")}"></div>
  <script type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
