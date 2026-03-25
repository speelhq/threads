import * as vscode from "vscode";
import { AuthManager } from "./auth.js";
import { ApiClient } from "./api.js";

const AUTH_CALLBACK_PAGE_URL = "http://localhost:5173/auth"; // TODO: configure per environment

let authManager: AuthManager;
let apiClient: ApiClient;
let pendingAuthState: string | null = null;

async function fetchAndNotifyUser(): Promise<void> {
  try {
    const result = await apiClient.login();
    authManager.notify({
      user: {
        id: result.id,
        email: result.email,
        display_name: result.display_name,
        role: result.role,
      },
      cohorts: result.cohorts,
    });
  } catch (err) {
    // User not found — attempt auto-signup
    if (err instanceof Error && "code" in err && (err as { code: string }).code === "USER_NOT_FOUND") {
      try {
        const created = await apiClient.signup();
        const result = await apiClient.login();
        authManager.notify({
          user: {
            id: result.id,
            email: result.email,
            display_name: result.display_name,
            role: result.role,
          },
          cohorts: result.cohorts,
        });
      } catch {
        await authManager.logout();
        vscode.window.showErrorMessage("Failed to create account");
      }
      return;
    }
    await authManager.logout();
    vscode.window.showErrorMessage("Failed to fetch user info");
  }
}

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("threads");
  const apiKey = config.get<string>("firebaseApiKey", "");
  const apiBaseUrl = config.get<string>("apiBaseUrl", "http://localhost:3000");

  authManager = new AuthManager(context.secrets, apiKey);

  apiClient = new ApiClient({
    baseUrl: apiBaseUrl,
    getToken: () => authManager.getIdToken(),
    onUnauthorized: () => authManager.tryRefresh(),
  });

  // URI handler for auth callback
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      async handleUri(uri: vscode.Uri) {
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

        await authManager.handleCallback(idToken, refreshToken);
        await fetchAndNotifyUser();
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
  void (async () => {
    const restored = await authManager.restore();
    if (restored) {
      await fetchAndNotifyUser();
    }
  })();
}

export function deactivate() {}
