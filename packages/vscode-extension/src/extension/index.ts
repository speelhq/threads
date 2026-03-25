import * as vscode from "vscode";
import { AuthManager } from "./auth.js";

const AUTH_CALLBACK_PAGE_URL = "http://localhost:5173/auth"; // TODO: configure per environment

let authManager: AuthManager;
let pendingAuthState: string | null = null;

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("threads");
  const apiKey = config.get<string>("firebaseApiKey", "");

  authManager = new AuthManager(context.secrets, apiKey);

  // URI handler for auth callback
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri) {
        if (uri.path !== "/auth-callback") return;

        const params = new URLSearchParams(uri.query);
        const idToken = params.get("idToken");
        const refreshToken = params.get("refreshToken");
        const state = params.get("state");

        if (!idToken || !refreshToken) {
          vscode.window.showErrorMessage("Authentication failed: missing tokens");
          return;
        }

        if (!pendingAuthState || state !== pendingAuthState) {
          vscode.window.showErrorMessage("Authentication failed: invalid state");
          return;
        }
        pendingAuthState = null;

        void authManager.handleCallback(idToken, refreshToken);
      },
    }),
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("threads.login", () => {
      pendingAuthState = crypto.randomUUID();
      authManager.startLogin(AUTH_CALLBACK_PAGE_URL, pendingAuthState);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("threads.logout", () => {
      void authManager.logout();
    }),
  );

  // Restore session
  void authManager.restore();
}

export function deactivate() {}
