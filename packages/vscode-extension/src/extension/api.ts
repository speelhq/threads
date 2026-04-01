import type {
  ThreadSummary,
  ThreadDetail,
  MessageItem,
  TodoItem,
  CrossThreadTodo,
  BookmarkItem,
  Tag,
  AuthUser,
  UserCohort,
} from "../protocol/index.js";
import { snakeToCamel } from "./snake-to-camel.js";

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

export type LoginResponse = AuthUser & {
  cohorts: UserCohort[];
  createdAt: string;
};

export type SignupResponse = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "member";
  createdAt: string;
};

export interface IApiClient {
  login(): Promise<LoginResponse>;
  signup(body?: { display_name: string }): Promise<SignupResponse>;
  getMe(): Promise<LoginResponse>;
  listThreads(params?: {
    tagId?: string;
    search?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ threads: ThreadSummary[]; nextCursor: string | null }>;
  getThread(id: string): Promise<ThreadDetail>;
  createThread(body: { title: string; tag_ids?: string[] }): Promise<ThreadSummary>;
  updateThread(id: string, body: { title?: string; pinned?: boolean }): Promise<ThreadSummary>;
  deleteThread(id: string): Promise<void>;
  createMessage(threadId: string, body: { body: string }): Promise<MessageItem>;
  updateMessage(id: string, body: { body: string }): Promise<MessageItem>;
  deleteMessage(id: string): Promise<void>;
  reorderMessages(
    threadId: string,
    body: { message_ids: string[] },
  ): Promise<{ messages: { id: string; position: number }[] }>;
  listCrossThreadTodos(params: {
    completed: boolean;
    cursor?: string;
    limit?: number;
  }): Promise<{ todos: CrossThreadTodo[]; nextCursor: string | null }>;
  createTodo(threadId: string, body: { content: string }): Promise<TodoItem>;
  updateTodo(id: string, body: { content?: string; completed?: boolean }): Promise<TodoItem>;
  deleteTodo(id: string): Promise<void>;
  createBookmark(threadId: string, body: { url: string }): Promise<BookmarkItem>;
  updateBookmark(id: string, body: { title?: string; description?: string }): Promise<BookmarkItem>;
  deleteBookmark(id: string): Promise<void>;
  listTags(params: { cohortId: string }): Promise<{ tags: Tag[] }>;
  createTag(body: { name: string }): Promise<Tag>;
  addThreadTag(
    threadId: string,
    tagId: string,
  ): Promise<{ threadId: string; tagId: string; createdAt: string }>;
  removeThreadTag(threadId: string, tagId: string): Promise<void>;
}

export class ApiClient implements IApiClient {
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
    return this.request<LoginResponse>("POST", "/auth/login");
  }

  async signup(body?: { display_name: string }) {
    return this.request<SignupResponse>("POST", "/auth/signup", body);
  }

  async getMe() {
    return this.request<LoginResponse>("GET", "/auth/me");
  }

  // ── Threads ──

  async listThreads(params?: { tagId?: string; search?: string; cursor?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.tagId) query.set("tag_id", params.tagId);
    if (params?.search) query.set("search", params.search);
    if (params?.cursor) query.set("cursor", params.cursor);
    if (params?.limit) query.set("limit", String(params.limit));
    return this.get<{ threads: ThreadSummary[]; nextCursor: string | null }>("/threads", query);
  }

  async getThread(id: string) {
    return this.request<ThreadDetail>("GET", `/threads/${id}`);
  }

  async createThread(body: { title: string; tag_ids?: string[] }) {
    return this.request<ThreadSummary>("POST", "/threads", body);
  }

  async updateThread(id: string, body: { title?: string; pinned?: boolean }) {
    return this.request<ThreadSummary>("PATCH", `/threads/${id}`, body);
  }

  async deleteThread(id: string) {
    return this.request<void>("DELETE", `/threads/${id}`);
  }

  // ── Messages ──

  async createMessage(threadId: string, body: { body: string }) {
    return this.request<MessageItem>("POST", `/threads/${threadId}/messages`, body);
  }

  async updateMessage(id: string, body: { body: string }) {
    return this.request<MessageItem>("PATCH", `/messages/${id}`, body);
  }

  async deleteMessage(id: string) {
    return this.request<void>("DELETE", `/messages/${id}`);
  }

  async reorderMessages(threadId: string, body: { message_ids: string[] }) {
    return this.request<{ messages: { id: string; position: number }[] }>(
      "PATCH",
      `/threads/${threadId}/messages/reorder`,
      body,
    );
  }

  // ── TODOs ──

  async listCrossThreadTodos(params: { completed: boolean; cursor?: string; limit?: number }) {
    const query = new URLSearchParams();
    query.set("completed", String(params.completed));
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.limit) query.set("limit", String(params.limit));
    return this.get<{ todos: CrossThreadTodo[]; nextCursor: string | null }>("/todos", query);
  }

  async createTodo(threadId: string, body: { content: string }) {
    return this.request<TodoItem>("POST", `/threads/${threadId}/todos`, body);
  }

  async updateTodo(id: string, body: { content?: string; completed?: boolean }) {
    return this.request<TodoItem>("PATCH", `/todos/${id}`, body);
  }

  async deleteTodo(id: string) {
    return this.request<void>("DELETE", `/todos/${id}`);
  }

  // ── Bookmarks ──

  async createBookmark(threadId: string, body: { url: string }) {
    return this.request<BookmarkItem>("POST", `/threads/${threadId}/bookmarks`, body);
  }

  async updateBookmark(id: string, body: { title?: string; description?: string }) {
    return this.request<BookmarkItem>("PATCH", `/bookmarks/${id}`, body);
  }

  async deleteBookmark(id: string) {
    return this.request<void>("DELETE", `/bookmarks/${id}`);
  }

  // ── Tags ──

  async listTags(params: { cohortId: string }) {
    const query = new URLSearchParams();
    query.set("cohort_id", params.cohortId);
    return this.get<{ tags: Tag[] }>("/tags", query);
  }

  async createTag(body: { name: string }) {
    return this.request<Tag>("POST", "/tags", body);
  }

  async addThreadTag(threadId: string, tagId: string) {
    return this.request<{ threadId: string; tagId: string; createdAt: string }>(
      "POST",
      `/threads/${threadId}/tags`,
      { tag_id: tagId },
    );
  }

  async removeThreadTag(threadId: string, tagId: string) {
    return this.request<void>("DELETE", `/threads/${threadId}/tags/${tagId}`);
  }

  // ── Internal ──

  private async get<T>(path: string, query: URLSearchParams): Promise<T> {
    const qs = query.toString();
    return this.request<T>("GET", `${path}${qs ? `?${qs}` : ""}`);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
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

  private async fetch(method: string, path: string, body?: unknown): Promise<Response> {
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
      const error = (data as { error?: { code?: string; message?: string } })?.error;
      throw new ApiError(res.status, error?.code ?? "UNKNOWN", error?.message ?? res.statusText);
    }

    return snakeToCamel(data) as T;
  }
}
