import type { IApiClient } from "./api.js";
import type {
  ThreadSummary,
  ThreadDetail,
  MessageItem,
  TodoItem,
  CrossThreadTodo,
  BookmarkItem,
  Tag,
} from "../protocol/index.js";

const now = new Date().toISOString();

const tags: Tag[] = [
  { id: "tag-1", name: "JavaScript", type: "preset", cohortId: "dev-cohort-1", createdAt: now },
  { id: "tag-2", name: "Java", type: "preset", cohortId: "dev-cohort-1", createdAt: now },
  { id: "tag-3", name: "DB", type: "preset", cohortId: "dev-cohort-1", createdAt: now },
  { id: "tag-4", name: "memo", type: "custom", cohortId: null, createdAt: now },
];

const threadDetails: Record<string, ThreadDetail> = {
  "thread-1": {
    id: "thread-1",
    title: "JavaScriptの基礎",
    workspaceId: "dev-workspace-1",
    pinnedAt: now,
    tags: [tags[0]!],
    messages: [
      { id: "msg-1", body: "## 変数の宣言\n\n`let`, `const`, `var` の違い:\n\n- **const**: 再代入不可。基本はこれを使う\n- **let**: 再代入が必要な場合\n- **var**: 使わない（スコープが関数単位で混乱する）\n\n```js\nconst name = \"World\";\nlet count = 0;\nconsole.log(\"Hello, \" + name + \"!\");\n```", position: 0, createdAt: now, updatedAt: now },
      { id: "msg-2", body: "## 型の種類\n\n`string`, `number`, `boolean`, `null`, `undefined`, `object`\n\n> `typeof null === 'object'` は有名なバグ\n\n| 型 | 例 |\n|---|---|\n| string | `\"hello\"` |\n| number | `42` |\n| boolean | `true` |", position: 1, createdAt: now, updatedAt: now },
    ],
    todos: [
      { id: "todo-1", content: "MDNのデータ型のページを読む", position: 0, completedAt: null, createdAt: now },
      { id: "todo-2", content: "typeof の練習問題をやる", position: 1, completedAt: null, createdAt: now },
    ],
    bookmarks: [
      { id: "bm-1", url: "https://developer.mozilla.org/ja/docs/Web/JavaScript/Data_structures", title: "JavaScript のデータ型とデータ構造 - MDN", description: "JavaScript の型についての詳細なリファレンス", domain: "developer.mozilla.org", position: 0, createdAt: now },
    ],
    createdAt: now,
    updatedAt: now,
  },
  "thread-2": {
    id: "thread-2",
    title: "配列とオブジェクト",
    workspaceId: "dev-workspace-1",
    pinnedAt: null,
    tags: [tags[0]!],
    messages: [
      { id: "msg-3", body: "配列の基本メソッド: push, pop, shift, unshift, splice", position: 0, createdAt: now, updatedAt: now },
    ],
    todos: [],
    bookmarks: [],
    createdAt: now,
    updatedAt: now,
  },
  "thread-3": {
    id: "thread-3",
    title: "SQL基礎 - SELECT文",
    workspaceId: "dev-workspace-1",
    pinnedAt: null,
    tags: [tags[2]!],
    messages: [
      { id: "msg-4", body: "SELECT文の基本構文\n\nSELECT column FROM table WHERE condition;", position: 0, createdAt: now, updatedAt: now },
    ],
    todos: [
      { id: "todo-3", content: "JOINの種類を整理する", position: 0, completedAt: null, createdAt: now },
    ],
    bookmarks: [],
    createdAt: now,
    updatedAt: now,
  },
};

function toSummary(d: ThreadDetail): ThreadSummary {
  return {
    id: d.id,
    title: d.title,
    pinnedAt: d.pinnedAt,
    tags: d.tags,
    incompleteTodoCount: d.todos.filter((t) => !t.completedAt).length,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

let idCounter = 100;
function nextId(prefix: string): string {
  return `${prefix}-${++idCounter}`;
}

export class MockApiClient implements IApiClient {
  async login() {
    return {
      id: "dev-user-1",
      email: "dev@example.com",
      displayName: "Dev User",
      role: "member" as const,
      cohorts: [{
        cohortId: "dev-cohort-1",
        workspaceId: "dev-workspace-1",
        name: "Dev Cohort",
        roleInCohort: "student" as const,
        startDate: now,
        endDate: now,
      }],
      createdAt: now,
    };
  }

  async signup() {
    return { id: "dev-user-1", email: "dev@example.com", displayName: "Dev User", role: "member" as const, createdAt: now };
  }

  async getMe() {
    return this.login();
  }

  async listThreads(params?: { tagId?: string; search?: string }) {
    let threads = Object.values(threadDetails).map(toSummary);
    if (params?.tagId) {
      threads = threads.filter((t) => t.tags.some((tag) => tag.id === params.tagId));
    }
    if (params?.search) {
      const s = params.search.toLowerCase();
      threads = threads.filter((t) => t.title.toLowerCase().includes(s));
    }
    return { threads, nextCursor: null };
  }

  async getThread(id: string) {
    const detail = threadDetails[id];
    if (!detail) throw new Error("NOT_FOUND");
    return detail;
  }

  async createThread(body: { title: string; tag_ids?: string[] }) {
    const id = nextId("thread");
    const tag = tags.find((t) => body.tag_ids?.includes(t.id)) ?? tags[0]!;
    const detail: ThreadDetail = {
      id,
      title: body.title,
      workspaceId: "dev-workspace-1",
      pinnedAt: null,
      tags: [tag],
      messages: [],
      todos: [],
      bookmarks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    threadDetails[id] = detail;
    return toSummary(detail);
  }

  async updateThread(id: string, body: { title?: string; pinned?: boolean }) {
    const detail = threadDetails[id];
    if (!detail) throw new Error("NOT_FOUND");
    if (body.title !== undefined) detail.title = body.title;
    if (body.pinned !== undefined) detail.pinnedAt = body.pinned ? new Date().toISOString() : null;
    detail.updatedAt = new Date().toISOString();
    return toSummary(detail);
  }

  async deleteThread(id: string) {
    delete threadDetails[id];
  }

  async createMessage(threadId: string, body: { body: string }) {
    const detail = threadDetails[threadId];
    if (!detail) throw new Error("NOT_FOUND");
    const msg: MessageItem = {
      id: nextId("msg"),
      body: body.body,
      position: detail.messages.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    detail.messages.push(msg);
    return msg;
  }

  async updateMessage(id: string, body: { body: string }) {
    for (const detail of Object.values(threadDetails)) {
      const msg = detail.messages.find((m) => m.id === id);
      if (msg) {
        msg.body = body.body;
        msg.updatedAt = new Date().toISOString();
        return msg;
      }
    }
    throw new Error("NOT_FOUND");
  }

  async deleteMessage(id: string) {
    for (const detail of Object.values(threadDetails)) {
      const idx = detail.messages.findIndex((m) => m.id === id);
      if (idx !== -1) { detail.messages.splice(idx, 1); return; }
    }
  }

  async reorderMessages() {
    return { messages: [] };
  }

  async listCrossThreadTodos(params: { completed: boolean }) {
    const todos: CrossThreadTodo[] = [];
    for (const detail of Object.values(threadDetails)) {
      for (const todo of detail.todos) {
        const isCompleted = todo.completedAt != null;
        if (isCompleted === params.completed) {
          todos.push({ ...todo, thread: { id: detail.id, title: detail.title } });
        }
      }
    }
    return { todos, nextCursor: null };
  }

  async createTodo(threadId: string, body: { content: string }) {
    const detail = threadDetails[threadId];
    if (!detail) throw new Error("NOT_FOUND");
    const todo: TodoItem = {
      id: nextId("todo"),
      content: body.content,
      position: detail.todos.length,
      completedAt: null,
      createdAt: new Date().toISOString(),
    };
    detail.todos.push(todo);
    return todo;
  }

  async updateTodo(id: string, body: { content?: string; completed?: boolean }) {
    for (const detail of Object.values(threadDetails)) {
      const todo = detail.todos.find((t) => t.id === id);
      if (todo) {
        if (body.content !== undefined) todo.content = body.content;
        if (body.completed !== undefined) todo.completedAt = body.completed ? new Date().toISOString() : null;
        return todo;
      }
    }
    throw new Error("NOT_FOUND");
  }

  async deleteTodo(id: string) {
    for (const detail of Object.values(threadDetails)) {
      const idx = detail.todos.findIndex((t) => t.id === id);
      if (idx !== -1) { detail.todos.splice(idx, 1); return; }
    }
  }

  async createBookmark(threadId: string, body: { url: string }) {
    const detail = threadDetails[threadId];
    if (!detail) throw new Error("NOT_FOUND");
    const bm: BookmarkItem = {
      id: nextId("bm"),
      url: body.url,
      title: null,
      description: null,
      domain: new URL(body.url).hostname,
      position: detail.bookmarks.length,
      createdAt: new Date().toISOString(),
    };
    detail.bookmarks.push(bm);
    return bm;
  }

  async updateBookmark(id: string, body: { title?: string; description?: string }) {
    for (const detail of Object.values(threadDetails)) {
      const bm = detail.bookmarks.find((b) => b.id === id);
      if (bm) {
        if (body.title !== undefined) bm.title = body.title;
        if (body.description !== undefined) bm.description = body.description;
        return bm;
      }
    }
    throw new Error("NOT_FOUND");
  }

  async deleteBookmark(id: string) {
    for (const detail of Object.values(threadDetails)) {
      const idx = detail.bookmarks.findIndex((b) => b.id === id);
      if (idx !== -1) { detail.bookmarks.splice(idx, 1); return; }
    }
  }

  async listTags() {
    return { tags: [...tags] };
  }

  async createTag(body: { name: string }) {
    const tag: Tag = { id: nextId("tag"), name: body.name, type: "custom", cohortId: null, createdAt: new Date().toISOString() };
    tags.push(tag);
    return tag;
  }

  async addThreadTag(threadId: string, tagId: string) {
    return { threadId, tagId, createdAt: new Date().toISOString() };
  }

  async removeThreadTag() {}
}
