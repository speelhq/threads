// ── Message structures ──

export type RequestMessage = {
  type: "request";
  id: string;
  command: string;
  payload?: unknown;
};

export type ResponseMessage = {
  type: "response";
  id: string;
  data?: unknown;
  error?: { code: string; message: string };
};

export type EventMessage = {
  type: "event";
  event: string;
  payload?: unknown;
};

export type Message = RequestMessage | ResponseMessage | EventMessage;

// ── Auth ──

export type AuthState = "unauthenticated" | "authenticating" | "authenticated" | "token_expired";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "member";
};

export type UserCohort = {
  cohortId: string;
  workspaceId: string;
  name: string;
  roleInCohort: "student" | "instructor";
  startDate: string;
  endDate: string;
};

export type AuthStatePayload = {
  user: AuthUser | null;
  cohorts: UserCohort[] | null;
};

// ── Commands (Webview → Extension Host) ──

export type Commands = {
  "auth.getState": { payload: undefined; response: AuthStatePayload };
  "auth.login": { payload: undefined; response: undefined };
  "auth.logout": { payload: undefined; response: undefined };
  "threads.open": { payload: { id: string; title: string }; response: undefined };

  "threads.list": {
    payload: {
      tagId?: string;
      search?: string;
      cursor?: string;
      limit?: number;
    };
    response: { threads: ThreadSummary[]; nextCursor: string | null };
  };
  "threads.get": { payload: { id: string }; response: ThreadDetail };
  "threads.create": {
    payload: { title: string; tagIds?: string[] };
    response: ThreadSummary;
  };
  "threads.update": {
    payload: { id: string; title?: string; pinned?: boolean };
    response: ThreadSummary;
  };
  "threads.delete": { payload: { id: string }; response: undefined };

  "messages.create": {
    payload: { threadId: string; body: string };
    response: MessageItem;
  };
  "messages.update": {
    payload: { id: string; body: string };
    response: MessageItem;
  };
  "messages.delete": { payload: { id: string }; response: undefined };
  "messages.reorder": {
    payload: { threadId: string; messageIds: string[] };
    response: { messages: { id: string; position: number }[] };
  };

  "todos.listCrossThread": {
    payload: { completed: boolean; cursor?: string; limit?: number };
    response: { todos: CrossThreadTodo[]; nextCursor: string | null };
  };
  "todos.create": {
    payload: { threadId: string; content: string };
    response: TodoItem;
  };
  "todos.update": {
    payload: { id: string; content?: string; completed?: boolean };
    response: TodoItem;
  };
  "todos.delete": { payload: { id: string }; response: undefined };

  "bookmarks.create": {
    payload: { threadId: string; url: string };
    response: BookmarkItem;
  };
  "bookmarks.update": {
    payload: { id: string; title?: string; description?: string };
    response: BookmarkItem;
  };
  "bookmarks.delete": { payload: { id: string }; response: undefined };

  "tags.list": {
    payload: { cohortId: string };
    response: { tags: Tag[] };
  };
  "tags.create": { payload: { name: string }; response: Tag };
  "threads.addTag": {
    payload: { threadId: string; tagId: string };
    response: { threadId: string; tagId: string; createdAt: string };
  };
  "threads.removeTag": {
    payload: { threadId: string; tagId: string };
    response: undefined;
  };
};

// ── Events (Extension Host → Webview) ──

export type Events = {
  "auth.stateChanged": AuthStatePayload;
  "threads.created": ThreadSummary;
  "threads.updated": ThreadSummary;
  "threads.deleted": { id: string };
};

// ── Domain types ──

export type Tag = {
  id: string;
  name: string;
  type: "preset" | "custom";
  cohortId: string | null;
  createdAt: string;
};

export type ThreadSummary = {
  id: string;
  title: string;
  pinnedAt: string | null;
  tags: Tag[];
  incompleteTodoCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ThreadDetail = {
  id: string;
  title: string;
  workspaceId: string;
  pinnedAt: string | null;
  tags: Tag[];
  messages: MessageItem[];
  todos: TodoItem[];
  bookmarks: BookmarkItem[];
  createdAt: string;
  updatedAt: string;
};

export type MessageItem = {
  id: string;
  body: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type TodoItem = {
  id: string;
  content: string;
  position: number;
  completedAt: string | null;
  createdAt: string;
};

export type CrossThreadTodo = {
  id: string;
  content: string;
  completedAt: string | null;
  createdAt: string;
  thread: { id: string; title: string };
};

export type BookmarkItem = {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  domain: string;
  position: number;
  createdAt: string;
};
