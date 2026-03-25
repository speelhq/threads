export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiClientConfig = {
  baseUrl: string;
  getToken: () => string | null;
  onUnauthorized: () => Promise<string | null>;
};

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getToken: () => string | null;
  private readonly onUnauthorized: () => Promise<string | null>;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl;
    this.getToken = config.getToken;
    this.onUnauthorized = config.onUnauthorized;
  }

  // ── Auth ──

  async login() {
    return this.request<{
      id: string;
      email: string;
      display_name: string;
      role: "admin" | "member";
      cohorts: {
        cohort_id: string;
        workspace_id: string;
        name: string;
        role_in_cohort: "student" | "instructor";
        start_date: string;
        end_date: string;
      }[];
      created_at: string;
    }>("POST", "/auth/login");
  }

  async signup() {
    return this.request<{
      id: string;
      email: string;
      display_name: string;
      role: "admin" | "member";
      created_at: string;
    }>("POST", "/auth/signup");
  }

  async getMe() {
    return this.login(); // Same response shape
  }

  // ── Threads ──

  async listThreads(params?: {
    tagId?: string;
    search?: string;
    cursor?: string;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.tagId) query.set("tag_id", params.tagId);
    if (params?.search) query.set("search", params.search);
    if (params?.cursor) query.set("cursor", params.cursor);
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return this.request("GET", `/threads${qs ? `?${qs}` : ""}`);
  }

  async getThread(id: string) {
    return this.request("GET", `/threads/${id}`);
  }

  async createThread(body: { title: string; tag_ids?: string[] }) {
    return this.request("POST", "/threads", body);
  }

  async updateThread(
    id: string,
    body: { title?: string; pinned?: boolean },
  ) {
    return this.request("PATCH", `/threads/${id}`, body);
  }

  async deleteThread(id: string) {
    return this.request("DELETE", `/threads/${id}`);
  }

  // ── Messages ──

  async createMessage(threadId: string, body: { body: string }) {
    return this.request("POST", `/threads/${threadId}/messages`, body);
  }

  async updateMessage(id: string, body: { body: string }) {
    return this.request("PATCH", `/messages/${id}`, body);
  }

  async deleteMessage(id: string) {
    return this.request("DELETE", `/messages/${id}`);
  }

  async reorderMessages(
    threadId: string,
    body: { message_ids: string[] },
  ) {
    return this.request(
      "PATCH",
      `/threads/${threadId}/messages/reorder`,
      body,
    );
  }

  // ── TODOs ──

  async listCrossThreadTodos(params: {
    completed: boolean;
    cursor?: string;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    query.set("completed", String(params.completed));
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.limit) query.set("limit", String(params.limit));
    return this.request("GET", `/todos?${query.toString()}`);
  }

  async createTodo(threadId: string, body: { content: string }) {
    return this.request("POST", `/threads/${threadId}/todos`, body);
  }

  async updateTodo(
    id: string,
    body: { content?: string; completed?: boolean },
  ) {
    return this.request("PATCH", `/todos/${id}`, body);
  }

  async deleteTodo(id: string) {
    return this.request("DELETE", `/todos/${id}`);
  }

  // ── Bookmarks ──

  async createBookmark(threadId: string, body: { url: string }) {
    return this.request("POST", `/threads/${threadId}/bookmarks`, body);
  }

  async updateBookmark(
    id: string,
    body: { title?: string; description?: string },
  ) {
    return this.request("PATCH", `/bookmarks/${id}`, body);
  }

  async deleteBookmark(id: string) {
    return this.request("DELETE", `/bookmarks/${id}`);
  }

  // ── Tags ──

  async listTags(params: { cohortId: string }) {
    return this.request("GET", `/tags?cohort_id=${params.cohortId}`);
  }

  async createTag(body: { name: string }) {
    return this.request("POST", "/tags", body);
  }

  async addThreadTag(threadId: string, tagId: string) {
    return this.request("POST", `/threads/${threadId}/tags`, {
      tag_id: tagId,
    });
  }

  async removeThreadTag(threadId: string, tagId: string) {
    return this.request("DELETE", `/threads/${threadId}/tags/${tagId}`);
  }

  // ── Internal ──

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetch(method, path, body);

    if (res.status === 401) {
      const newToken = await this.onUnauthorized();
      if (newToken) {
        const retry = await this.fetch(method, path, body);
        return this.handleResponse<T>(retry);
      }
      throw new ApiError(401, "UNAUTHORIZED", "Authentication failed");
    }

    return this.handleResponse<T>(res);
  }

  private async fetch(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = {};

    const token = this.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    try {
      const init: RequestInit = { method, headers };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
      }
      return await globalThis.fetch(`${this.baseUrl}${path}`, init);
    } catch (err) {
      throw new ApiError(0, "NETWORK_ERROR", (err as Error).message);
    }
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (res.status === 204) {
      return undefined as T;
    }

    const data = await res.json();

    if (!res.ok) {
      const error = (data as { error?: { code?: string; message?: string } })
        ?.error;
      throw new ApiError(
        res.status,
        error?.code ?? "UNKNOWN",
        error?.message ?? res.statusText,
      );
    }

    return data as T;
  }
}
