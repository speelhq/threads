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
    <div style={{ padding: "16px", textAlign: "center" }}>
      <p>Sign in to start taking notes.</p>
      <button
        onClick={() => void execute()}
        disabled={loading}
        style={buttonStyle}
      >
        {loading ? "Opening browser..." : "Sign in with Google"}
      </button>
      {error && <p style={{ color: "var(--vscode-errorForeground)" }}>{error.message}</p>}
    </div>
  );
}

function ViewSwitcher({ view, onSwitch }: { view: View; onSwitch: (v: View) => void }) {
  return (
    <div style={{ display: "flex", borderBottom: "1px solid var(--vscode-panel-border)" }}>
      <button
        onClick={() => onSwitch("threads")}
        style={tabStyle(view === "threads")}
      >
        Threads
      </button>
      <button
        onClick={() => onSwitch("todos")}
        style={tabStyle(view === "todos")}
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
    next_cursor: string | null;
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
    <div style={{ padding: "8px" }}>
      <div style={{ display: "flex", gap: "4px", marginBottom: "8px" }}>
        <input
          type="text"
          placeholder="Search threads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={inputStyle}
        />
        <button onClick={() => void handleNewThread()} style={buttonStyle}>
          +
        </button>
      </div>

      {tags.length > 0 && (
        <select
          value={tagId ?? ""}
          onChange={(e) => setTagId(e.target.value || undefined)}
          style={inputStyle}
        >
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      )}

      {loading && <p style={{ opacity: 0.5 }}>Loading...</p>}

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {threads.map((thread) => (
          <ThreadItem key={thread.id} thread={thread} />
        ))}
      </ul>

      {!loading && threads.length === 0 && (
        <p style={{ opacity: 0.5, textAlign: "center" }}>No threads yet</p>
      )}
    </div>
  );
}

function ThreadItem({ thread }: { thread: ThreadSummary }) {
  return (
    <li
      style={{
        padding: "8px",
        cursor: "pointer",
        borderBottom: "1px solid var(--vscode-panel-border)",
      }}
      onClick={() => {
        // TODO: open editor tab via command
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        {thread.pinned_at && <span title="Pinned">📌</span>}
        <span style={{ fontWeight: 500 }}>{thread.title}</span>
        {thread.incomplete_todo_count > 0 && (
          <span style={badgeStyle}>{thread.incomplete_todo_count}</span>
        )}
      </div>
      {thread.tags.length > 0 && (
        <div style={{ display: "flex", gap: "4px", marginTop: "4px", flexWrap: "wrap" }}>
          {thread.tags.map((tag) => (
            <span key={tag.id} style={tagBadgeStyle}>
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
    next_cursor: string | null;
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
    <div style={{ padding: "8px" }}>
      {loading && <p style={{ opacity: 0.5 }}>Loading...</p>}

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {todos.map((todo) => (
          <li
            key={todo.id}
            style={{
              padding: "8px",
              borderBottom: "1px solid var(--vscode-panel-border)",
              display: "flex",
              gap: "8px",
              alignItems: "flex-start",
            }}
          >
            <input
              type="checkbox"
              checked={todo.completed_at != null}
              onChange={() => void toggleTodo(todo.id, todo.completed_at == null)}
            />
            <div>
              <div>{todo.content}</div>
              <div style={{ fontSize: "0.85em", opacity: 0.7 }}>
                {todo.thread.title}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {!loading && todos.length === 0 && (
        <p style={{ opacity: 0.5, textAlign: "center" }}>All done!</p>
      )}
    </div>
  );
}

// ── Styles ──

const buttonStyle: React.CSSProperties = {
  background: "var(--vscode-button-background)",
  color: "var(--vscode-button-foreground)",
  border: "none",
  padding: "6px 12px",
  cursor: "pointer",
  borderRadius: "2px",
};

const inputStyle: React.CSSProperties = {
  background: "var(--vscode-input-background)",
  color: "var(--vscode-input-foreground)",
  border: "1px solid var(--vscode-input-border)",
  padding: "4px 8px",
  flex: 1,
  borderRadius: "2px",
};

const badgeStyle: React.CSSProperties = {
  background: "var(--vscode-badge-background)",
  color: "var(--vscode-badge-foreground)",
  borderRadius: "10px",
  padding: "0 6px",
  fontSize: "0.8em",
  lineHeight: "1.6",
};

const tagBadgeStyle: React.CSSProperties = {
  background: "var(--vscode-badge-background)",
  color: "var(--vscode-badge-foreground)",
  borderRadius: "2px",
  padding: "1px 6px",
  fontSize: "0.8em",
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "8px",
    background: "transparent",
    color: active
      ? "var(--vscode-foreground)"
      : "var(--vscode-disabledForeground)",
    border: "none",
    borderBottom: active
      ? "2px solid var(--vscode-focusBorder)"
      : "2px solid transparent",
    cursor: "pointer",
  };
}
