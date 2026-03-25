import * as vscode from "vscode";
import type { AuthState, AuthStatePayload } from "../protocol/index.js";

const REFRESH_TOKEN_KEY = "threads.refreshToken";
const FIREBASE_TOKEN_URL = "https://securetoken.googleapis.com/v1/token";

type TokenResponse = {
  id_token: string;
  refresh_token: string;
  expires_in: string;
};

type AuthStateListener = (payload: AuthStatePayload) => void;

export class AuthManager {
  private state: AuthState = "unauthenticated";
  private idToken: string | null = null;
  private refreshToken: string | null = null;
  private lastPayload: AuthStatePayload = { user: null, cohorts: null };
  private listeners: AuthStateListener[] = [];

  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly apiKey: string,
  ) {}

  getState(): AuthState {
    return this.state;
  }

  getIdToken(): string | null {
    return this.idToken;
  }

  getLastPayload(): AuthStatePayload {
    return this.lastPayload;
  }

  onStateChange(listener: AuthStateListener): vscode.Disposable {
    this.listeners.push(listener);
    return new vscode.Disposable(() => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    });
  }

  /**
   * Attempt to restore session from stored refresh token.
   * Called on extension activation.
   */
  async restore(): Promise<boolean> {
    const stored = await this.secrets.get(REFRESH_TOKEN_KEY);
    if (!stored) return false;

    this.setState("authenticating");
    try {
      await this.refreshIdToken(stored);
      this.setState("authenticated");
      return true;
    } catch {
      await this.secrets.delete(REFRESH_TOKEN_KEY);
      this.setState("unauthenticated");
      return false;
    }
  }

  /**
   * Handle the auth callback from the browser.
   * Called by the URI handler when vscode://threads.threads/auth-callback is invoked.
   */
  async handleCallback(idToken: string, refreshToken: string): Promise<void> {
    this.idToken = idToken;
    this.refreshToken = refreshToken;
    await this.secrets.store(REFRESH_TOKEN_KEY, refreshToken);
    this.setState("authenticated");
  }

  /**
   * Attempt to refresh the ID token.
   * Returns the new ID token on success, null on failure.
   */
  async tryRefresh(): Promise<string | null> {
    if (!this.refreshToken) return null;

    this.setState("token_expired");
    try {
      await this.refreshIdToken(this.refreshToken);
      this.setState("authenticated");
      return this.idToken;
    } catch {
      await this.logout();
      return null;
    }
  }

  async logout(): Promise<void> {
    this.idToken = null;
    this.refreshToken = null;
    await this.secrets.delete(REFRESH_TOKEN_KEY);
    this.setState("unauthenticated");
    this.notify({ user: null, cohorts: null });
  }

  /**
   * Open the browser to start the Google sign-in flow.
   */
  startLogin(callbackPageUrl: string, state: string): void {
    this.setState("authenticating");
    const url = `${callbackPageUrl}?state=${encodeURIComponent(state)}`;
    vscode.env.openExternal(vscode.Uri.parse(url));
  }

  private async refreshIdToken(refreshToken: string): Promise<void> {
    const url = `${FIREBASE_TOKEN_URL}?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    });

    if (!res.ok) {
      throw new Error(`Token refresh failed: ${res.status}`);
    }

    const data = (await res.json()) as TokenResponse;
    this.idToken = data.id_token;
    this.refreshToken = data.refresh_token;
    await this.secrets.store(REFRESH_TOKEN_KEY, data.refresh_token);
  }

  private setState(newState: AuthState): void {
    this.state = newState;
  }

  notify(payload: AuthStatePayload): void {
    this.lastPayload = payload;
    for (const listener of this.listeners) {
      listener(payload);
    }
  }
}
