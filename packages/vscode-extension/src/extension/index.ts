import * as vscode from "vscode";
import { AuthManager } from "./auth.js";
import { ApiClient, ApiError } from "./api.js";
import type { IApiClient } from "./api.js";
import { MockApiClient } from "./mock-api.js";
import { SidebarProvider } from "./sidebar.js";
import { EditorManager } from "./editor.js";
import { EventBus } from "./event-bus.js";

const AUTH_CALLBACK_PAGE_URL = "http://localhost:5173/auth"; // TODO: configure per environment

let authManager: AuthManager;
let apiClient: IApiClient;
let sidebarProvider: SidebarProvider;
let editorManager: EditorManager;
let pendingAuthState: string | null = null;

async function fetchAndNotifyUser(): Promise<void> {
  try {
    const result = await apiClient.login();
    authManager.notify({
      user: {
        id: result.id,
        email: result.email,
        displayName: result.displayName,
        role: result.role,
      },
      cohorts: result.cohorts,
    });
  } catch (err) {
    if (err instanceof ApiError && err.code === "USER_NOT_FOUND") {
      try {
        await apiClient.signup();
        const result = await apiClient.login();
        authManager.notify({
          user: {
            id: result.id,
            email: result.email,
            displayName: result.displayName,
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
  const devMode = config.get<boolean>("devMode", false);

  authManager = new AuthManager(context.secrets, apiKey);

  if (devMode) {
    apiClient = new MockApiClient();
  } else {
    apiClient = new ApiClient({
      baseUrl: apiBaseUrl,
      getToken: () => authManager.getIdToken(),
      onUnauthorized: () => authManager.tryRefresh(),
    });
  }

  const eventBus = new EventBus();

  // Editor (created before sidebar so sidebar can reference it)
  editorManager = new EditorManager(context.extensionUri, apiClient, eventBus);

  // Sidebar
  sidebarProvider = new SidebarProvider(
    context.extensionUri,
    authManager,
    apiClient,
    eventBus,
    editorManager,
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("threads.sidebar", sidebarProvider),
  );

  // Forward auth state changes via event bus
  context.subscriptions.push(
    authManager.onStateChange((payload) => {
      eventBus.emit("auth.stateChanged", payload);
    }),
  );

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
      if (devMode) {
        void vscode.commands.executeCommand("threads.devLogin");
        return;
      }
      pendingAuthState = crypto.randomUUID();
      authManager.startLogin(AUTH_CALLBACK_PAGE_URL, pendingAuthState);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("threads.logout", () => {
      void authManager.logout();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("threads.devLogin", async () => {
      const result = await apiClient.login();
      authManager.notify({
        user: {
          id: result.id,
          email: result.email,
          displayName: result.displayName,
          role: result.role,
        },
        cohorts: result.cohorts,
      });
    }),
  );

  // Restore session
  if (devMode) {
    void vscode.commands.executeCommand("threads.devLogin");
  } else {
    void (async () => {
      const restored = await authManager.restore();
      if (restored) {
        await fetchAndNotifyUser();
      }
    })();
  }
}

export function deactivate() {}
