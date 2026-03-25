import { useState, useEffect } from "react";
import { useCommand } from "../hooks/useCommand.js";
import type {
  ThreadDetail,
  ThreadSummary,
  MessageItem,
  TodoItem,
  BookmarkItem,
} from "../../protocol/index.js";

const threadId = document.getElementById("root")!.dataset.threadId!;

export function App() {
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const { execute: fetchThread, loading } = useCommand<ThreadDetail>("threads.get");

  useEffect(() => {
    void loadThread();
  }, []);

  async function loadThread() {
    try {
      const result = await fetchThread({ id: threadId });
      setThread(result);
    } catch {
      // Error handled by useCommand
    }
  }

  if (loading && !thread) {
    return <div style={{ padding: "16px", opacity: 0.5 }}>Loading...</div>;
  }

  if (!thread) {
    return <div style={{ padding: "16px" }}>Thread not found</div>;
  }

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <ThreadHeader thread={thread} onUpdate={loadThread} />
        <MessageList messages={thread.messages} threadId={threadId} onUpdate={loadThread} />
        <MessageInput threadId={threadId} onSend={loadThread} />
      </div>
      <div style={{
        width: "280px",
        borderLeft: "1px solid var(--vscode-panel-border)",
        overflow: "auto",
      }}>
        <TodoPanel todos={thread.todos} threadId={threadId} onUpdate={loadThread} />
        <BookmarkPanel bookmarks={thread.bookmarks} threadId={threadId} onUpdate={loadThread} />
      </div>
    </div>
  );
}

// ── Header ──

function ThreadHeader({
  thread,
  onUpdate,
}: {
  thread: ThreadDetail;
  onUpdate: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(thread.title);
  const { execute: updateThread } = useCommand<ThreadSummary>("threads.update");
  const { execute: deleteThread } = useCommand("threads.delete");

  async function handleSaveTitle() {
    if (title.trim() && title !== thread.title) {
      try {
        await updateThread({ id: thread.id, title: title.trim() });
        await onUpdate();
      } catch {
        setTitle(thread.title);
      }
    }
    setEditing(false);
  }

  async function handleTogglePin() {
    try {
      await updateThread({ id: thread.id, pinned: thread.pinned_at == null });
      await onUpdate();
    } catch {
      // Error handled by useCommand
    }
  }

  async function handleDelete() {
    // TODO: confirmation dialog via postMessage to Extension Host
    try {
      await deleteThread({ id: thread.id });
    } catch {
      // Error handled by useCommand
    }
  }

  return (
    <div style={{
      padding: "12px 16px",
      borderBottom: "1px solid var(--vscode-panel-border)",
      display: "flex",
      alignItems: "center",
      gap: "8px",
    }}>
      {editing ? (
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void handleSaveTitle()}
          onKeyDown={(e) => { if (e.key === "Enter") void handleSaveTitle(); }}
          autoFocus
          style={inputStyle}
        />
      ) : (
        <span
          style={{ fontWeight: 600, fontSize: "1.1em", cursor: "pointer", flex: 1 }}
          onClick={() => setEditing(true)}
        >
          {thread.title}
        </span>
      )}

      <button onClick={() => void handleTogglePin()} style={iconButtonStyle} title={thread.pinned_at ? "Unpin" : "Pin"}>
        {thread.pinned_at ? "📌" : "📍"}
      </button>
      <button onClick={() => void handleDelete()} style={iconButtonStyle} title="Delete thread">
        🗑️
      </button>

      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
        {thread.tags.map((tag) => (
          <span key={tag.id} style={tagBadgeStyle}>{tag.name}</span>
        ))}
      </div>
    </div>
  );
}

// ── Messages ──

function MessageList({
  messages,
  threadId,
  onUpdate,
}: {
  messages: MessageItem[];
  threadId: string;
  onUpdate: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const { execute: updateMessage } = useCommand<MessageItem>("messages.update");
  const { execute: deleteMessage } = useCommand("messages.delete");

  async function handleSave(id: string) {
    if (editBody.trim()) {
      try {
        await updateMessage({ id, body: editBody.trim() });
        await onUpdate();
      } catch {
        // Error handled by useCommand
      }
    }
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    try {
      await deleteMessage({ id });
      await onUpdate();
    } catch {
      // Error handled by useCommand
    }
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
      {messages.map((msg) => (
        <div key={msg.id} style={{
          padding: "8px 0",
          borderBottom: "1px solid var(--vscode-panel-border)",
        }}>
          {editingId === msg.id ? (
            <div>
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                style={{ ...inputStyle, width: "100%", minHeight: "60px", resize: "vertical" }}
                autoFocus
              />
              <div style={{ display: "flex", gap: "4px", marginTop: "4px" }}>
                <button onClick={() => void handleSave(msg.id)} style={buttonStyle}>Save</button>
                <button onClick={() => setEditingId(null)} style={secondaryButtonStyle}>Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ whiteSpace: "pre-wrap" }}>{msg.body}</div>
              <div style={{ display: "flex", gap: "4px", marginTop: "4px", opacity: 0.5 }}>
                <button
                  onClick={() => { setEditingId(msg.id); setEditBody(msg.body); }}
                  style={iconButtonStyle}
                >
                  ✏️
                </button>
                <button onClick={() => void handleDelete(msg.id)} style={iconButtonStyle}>
                  🗑️
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MessageInput({
  threadId,
  onSend,
}: {
  threadId: string;
  onSend: () => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const { execute: createMessage, loading } = useCommand<MessageItem>("messages.create");

  async function handleSend() {
    if (!body.trim()) return;
    try {
      await createMessage({ threadId, body: body.trim() });
      setBody("");
      await onSend();
    } catch {
      // Error handled by useCommand
    }
  }

  return (
    <div style={{
      padding: "8px 16px",
      borderTop: "1px solid var(--vscode-panel-border)",
      display: "flex",
      gap: "8px",
    }}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a message..."
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
          }
        }}
        style={{ ...inputStyle, flex: 1, minHeight: "40px", resize: "vertical" }}
      />
      <button onClick={() => void handleSend()} disabled={loading || !body.trim()} style={buttonStyle}>
        Send
      </button>
    </div>
  );
}

// ── TODOs ──

function TodoPanel({
  todos,
  threadId,
  onUpdate,
}: {
  todos: TodoItem[];
  threadId: string;
  onUpdate: () => Promise<void>;
}) {
  const [newContent, setNewContent] = useState("");
  const { execute: createTodo } = useCommand<TodoItem>("todos.create");
  const { execute: updateTodo } = useCommand<TodoItem>("todos.update");
  const { execute: deleteTodo } = useCommand("todos.delete");

  async function handleAdd() {
    if (!newContent.trim()) return;
    try {
      await createTodo({ threadId, content: newContent.trim() });
      setNewContent("");
      await onUpdate();
    } catch {
      // Error handled by useCommand
    }
  }

  async function handleToggle(id: string, completed: boolean) {
    try {
      await updateTodo({ id, completed });
      await onUpdate();
    } catch {
      // Error handled by useCommand
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTodo({ id });
      await onUpdate();
    } catch {
      // Error handled by useCommand
    }
  }

  return (
    <div style={{ padding: "8px" }}>
      <div style={{ fontWeight: 600, marginBottom: "8px" }}>TODOs</div>
      <div style={{ display: "flex", gap: "4px", marginBottom: "8px" }}>
        <input
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Add TODO..."
          onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
          style={inputStyle}
        />
        <button onClick={() => void handleAdd()} style={buttonStyle}>+</button>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {todos.map((todo) => (
          <li key={todo.id} style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "4px 0",
          }}>
            <input
              type="checkbox"
              checked={todo.completed_at != null}
              onChange={() => void handleToggle(todo.id, todo.completed_at == null)}
            />
            <span style={{
              flex: 1,
              textDecoration: todo.completed_at ? "line-through" : "none",
              opacity: todo.completed_at ? 0.5 : 1,
            }}>
              {todo.content}
            </span>
            <button onClick={() => void handleDelete(todo.id)} style={iconButtonStyle}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Bookmarks ──

function BookmarkPanel({
  bookmarks,
  threadId,
  onUpdate,
}: {
  bookmarks: BookmarkItem[];
  threadId: string;
  onUpdate: () => Promise<void>;
}) {
  const [newUrl, setNewUrl] = useState("");
  const { execute: createBookmark, loading } = useCommand<BookmarkItem>("bookmarks.create");
  const { execute: deleteBookmark } = useCommand("bookmarks.delete");

  async function handleAdd() {
    if (!newUrl.trim()) return;
    try {
      await createBookmark({ threadId, url: newUrl.trim() });
      setNewUrl("");
      await onUpdate();
    } catch {
      // Error handled by useCommand
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteBookmark({ id });
      await onUpdate();
    } catch {
      // Error handled by useCommand
    }
  }

  return (
    <div style={{ padding: "8px", borderTop: "1px solid var(--vscode-panel-border)" }}>
      <div style={{ fontWeight: 600, marginBottom: "8px" }}>Bookmarks</div>
      <div style={{ display: "flex", gap: "4px", marginBottom: "8px" }}>
        <input
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="Add URL..."
          onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
          style={inputStyle}
        />
        <button onClick={() => void handleAdd()} disabled={loading} style={buttonStyle}>+</button>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {bookmarks.map((bm) => (
          <li key={bm.id} style={{
            padding: "6px 0",
            borderBottom: "1px solid var(--vscode-panel-border)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <a
                href={bm.url}
                style={{ color: "var(--vscode-textLink-foreground)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {bm.title || bm.url}
              </a>
              <button onClick={() => void handleDelete(bm.id)} style={iconButtonStyle}>×</button>
            </div>
            {bm.description && (
              <div style={{ fontSize: "0.85em", opacity: 0.7, marginTop: "2px" }}>
                {bm.description}
              </div>
            )}
            <div style={{ fontSize: "0.8em", opacity: 0.5 }}>{bm.domain}</div>
          </li>
        ))}
      </ul>
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

const secondaryButtonStyle: React.CSSProperties = {
  background: "var(--vscode-button-secondaryBackground)",
  color: "var(--vscode-button-secondaryForeground)",
  border: "none",
  padding: "6px 12px",
  cursor: "pointer",
  borderRadius: "2px",
};

const iconButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: "2px 4px",
};

const inputStyle: React.CSSProperties = {
  background: "var(--vscode-input-background)",
  color: "var(--vscode-input-foreground)",
  border: "1px solid var(--vscode-input-border)",
  padding: "4px 8px",
  borderRadius: "2px",
};

const tagBadgeStyle: React.CSSProperties = {
  background: "var(--vscode-badge-background)",
  color: "var(--vscode-badge-foreground)",
  borderRadius: "2px",
  padding: "1px 6px",
  fontSize: "0.8em",
};
