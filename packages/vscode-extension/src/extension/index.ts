import * as vscode from "vscode";
import { AuthManager } from "./auth.js";

const FIREBASE_API_KEY = ""; // TODO: inject via configuration
const AUTH_CALLBACK_PAGE_URL = "http://localhost:5173/auth"; // TODO: configure per environment

let authManager: AuthManager;

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("threads");
  const apiKey = FIREBASE_API_KEY || config.get<string>("firebaseApiKey", "");

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

        // TODO: validate state parameter against stored value
        void authManager.handleCallback(idToken, refreshToken);
      },
    }),
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("threads.login", () => {
      const state = crypto.randomUUID();
      // TODO: store state for validation
      authManager.startLogin(AUTH_CALLBACK_PAGE_URL, state);
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
