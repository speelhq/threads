import { useState, useEffect, useRef } from "react";
import { onEvent, useCommand } from "../hooks/useCommand.js";
import type { ThreadSummary, CrossThreadTodo, Tag } from "../../protocol/index.js";

type View = "threads" | "todos";

export function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [view, setView] = useState<View>("threads");

  useEffect(() => {
    return onEvent("auth.stateChanged", (payload) => {
      const p = payload as { user: unknown } | undefined;
      setAuthenticated(p?.user != null);
    });
  }, []);

  if (!authenticated) {
    return <LoginView />;
  }

  return (
    <div>
      <ViewSwitcher view={view} onSwitch={setView} />
      {view === "threads" ? <ThreadListView /> : <TodoListView />}
    </div>
  );
}

function LoginView() {
  const { execute, loading, error } = useCommand("auth.login");

  return (
    <div className="p-4 text-center">
      <p>Sign in to start taking notes.</p>
      <button
        onClick={() => void execute()}
        disabled={loading}
        className="bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-none px-3 py-1.5 cursor-pointer rounded-sm"
      >
        {loading ? "Opening browser..." : "Sign in with Google"}
      </button>
      {error && <p className="text-[var(--vscode-errorForeground)]">{error.message}</p>}
    </div>
  );
}

function ViewSwitcher({ view, onSwitch }: { view: View; onSwitch: (v: View) => void }) {
  return (
    <div className="flex border-b border-[var(--vscode-panel-border)]">
      <button
        onClick={() => onSwitch("threads")}
        className={`flex-1 p-2 bg-transparent border-none cursor-pointer border-b-2 ${
          view === "threads"
            ? "text-[var(--vscode-foreground)] border-b-[var(--vscode-focusBorder)]"
            : "text-[var(--vscode-disabledForeground)] border-b-transparent"
        }`}
      >
        Threads
      </button>
      <button
        onClick={() => onSwitch("todos")}
        className={`flex-1 p-2 bg-transparent border-none cursor-pointer border-b-2 ${
          view === "todos"
            ? "text-[var(--vscode-foreground)] border-b-[var(--vscode-focusBorder)]"
            : "text-[var(--vscode-disabledForeground)] border-b-transparent"
        }`}
      >
        TODOs
      </button>
    </div>
  );
}

function ThreadListView() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tagId, setTagId] = useState<string | undefined>();
  const [tags, setTags] = useState<Tag[]>([]);
  const { execute: fetchThreads, loading } = useCommand<{
    threads: ThreadSummary[];
    nextCursor: string | null;
  }>("threads.list");
  const { execute: fetchTags } = useCommand<{ tags: Tag[] }>("tags.list");
  const { execute: createThread } = useCommand<ThreadSummary>("threads.create");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(debounceTimer.current);
  }, [search]);

  useEffect(() => {
    void loadThreads();
  }, [debouncedSearch, tagId]);

  useEffect(() => {
    // TODO: get cohortId from auth state
    return onEvent("threads.created", () => void loadThreads());
  }, []);

  useEffect(() => {
    return onEvent("threads.updated", () => void loadThreads());
  }, []);

  useEffect(() => {
    return onEvent("threads.deleted", () => void loadThreads());
  }, []);

  async function loadThreads() {
    try {
      const result = await fetchThreads({ search: debouncedSearch || undefined, tagId });
      setThreads(result.threads);
    } catch {
      // Error handled by useCommand
    }
  }

  async function handleNewThread() {
    const title = "New Thread"; // TODO: prompt for title
    try {
      await createThread({ title });
      await loadThreads();
    } catch {
      // Error handled by useCommand
    }
  }

  return (
    <div className="p-2">
      <div className="flex gap-1 mb-2">
        <input
          type="text"
          placeholder="Search threads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] px-2 py-1 flex-1 rounded-sm"
        />
        <button
          onClick={() => void handleNewThread()}
          className="bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-none px-3 py-1.5 cursor-pointer rounded-sm"
        >
          +
        </button>
      </div>

      {tags.length > 0 && (
        <select
          value={tagId ?? ""}
          onChange={(e) => setTagId(e.target.value || undefined)}
          className="bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] px-2 py-1 flex-1 rounded-sm"
        >
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      )}

      {loading && <p className="opacity-50">Loading...</p>}

      <ul className="list-none">
        {threads.map((thread) => (
          <ThreadItem key={thread.id} thread={thread} />
        ))}
      </ul>

      {!loading && threads.length === 0 && (
        <p className="opacity-50 text-center">No threads yet</p>
      )}
    </div>
  );
}

function ThreadItem({ thread }: { thread: ThreadSummary }) {
  const { execute: openThread } = useCommand("threads.open");

  return (
    <li
      className="p-2 cursor-pointer border-b border-[var(--vscode-panel-border)]"
      onClick={() => void openThread({ id: thread.id, title: thread.title })}
    >
      <div className="flex items-center gap-1">
        {thread.pinnedAt && <span title="Pinned">📌</span>}
        <span className="font-medium">{thread.title}</span>
        {thread.incompleteTodoCount > 0 && (
          <span className="bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded-full px-1.5 text-xs leading-relaxed">
            {thread.incompleteTodoCount}
          </span>
        )}
      </div>
      {thread.tags.length > 0 && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {thread.tags.map((tag) => (
            <span
              key={tag.id}
              className="bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded-sm px-1.5 text-xs"
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function TodoListView() {
  const [todos, setTodos] = useState<CrossThreadTodo[]>([]);
  const { execute: fetchTodos, loading } = useCommand<{
    todos: CrossThreadTodo[];
    nextCursor: string | null;
  }>("todos.listCrossThread");
  const { execute: updateTodo } = useCommand("todos.update");

  useEffect(() => {
    void loadTodos();
  }, []);

  async function loadTodos() {
    try {
      const result = await fetchTodos({ completed: false });
      setTodos(result.todos);
    } catch {
      // Error handled by useCommand
    }
  }

  async function toggleTodo(id: string, completed: boolean) {
    try {
      await updateTodo({ id, completed });
      await loadTodos();
    } catch {
      // Error handled by useCommand
    }
  }

  return (
    <div className="p-2">
      {loading && <p className="opacity-50">Loading...</p>}

      <ul className="list-none">
        {todos.map((todo) => (
          <li
            key={todo.id}
            className="p-2 border-b border-[var(--vscode-panel-border)] flex gap-2 items-start"
          >
            <input
              type="checkbox"
              checked={todo.completedAt != null}
              onChange={() => void toggleTodo(todo.id, todo.completedAt == null)}
            />
            <div>
              <div>{todo.content}</div>
              <div className="text-sm opacity-70">
                {todo.thread.title}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {!loading && todos.length === 0 && (
        <p className="opacity-50 text-center">All done!</p>
      )}
    </div>
  );
}
