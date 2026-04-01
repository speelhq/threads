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
    return <div className="p-4 opacity-50">Loading...</div>;
  }

  if (!thread) {
    return <div className="p-4">Thread not found</div>;
  }

  return (
    <div className="flex h-screen">
      <div className="flex-1 flex flex-col overflow-hidden">
        <ThreadHeader thread={thread} onUpdate={loadThread} />
        <MessageList messages={thread.messages} threadId={threadId} onUpdate={loadThread} />
        <MessageInput threadId={threadId} onSend={loadThread} />
      </div>
      <div className="w-[280px] border-l border-[var(--vscode-panel-border)] overflow-auto">
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
      await updateThread({ id: thread.id, pinned: thread.pinnedAt == null });
      await onUpdate();
    } catch {
      // Error handled by useCommand
    }
  }

  async function handleDelete() {
    try {
      await deleteThread({ id: thread.id });
    } catch {
      // Error handled by useCommand
    }
  }

  return (
    <div className="px-4 py-3 border-b border-[var(--vscode-panel-border)] flex items-center gap-2">
      {editing ? (
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void handleSaveTitle()}
          onKeyDown={(e) => { if (e.key === "Enter") void handleSaveTitle(); }}
          autoFocus
          className="bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] px-2 py-1 rounded-sm flex-1"
        />
      ) : (
        <span
          className="font-semibold text-lg cursor-pointer flex-1"
          onClick={() => setEditing(true)}
        >
          {thread.title}
        </span>
      )}

      <button
        onClick={() => void handleTogglePin()}
        className="bg-transparent border-none cursor-pointer px-1 py-0.5"
        title={thread.pinnedAt ? "Unpin" : "Pin"}
      >
        <span className={`codicon codicon-pin${thread.pinnedAt ? "ned" : ""}`} />
      </button>
      <button
        onClick={() => void handleDelete()}
        className="bg-transparent border-none cursor-pointer px-1 py-0.5"
        title="Delete thread"
      >
        <span className="codicon codicon-trash" />
      </button>

      <div className="flex gap-1 flex-wrap">
        {thread.tags.map((tag) => (
          <span
            key={tag.id}
            className="bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded-sm px-1.5 text-xs"
          >
            {tag.name}
          </span>
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
    <div className="flex-1 overflow-auto px-4 py-2">
      {messages.map((msg) => (
        <div key={msg.id} className="py-2 border-b border-[var(--vscode-panel-border)]">
          {editingId === msg.id ? (
            <div>
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                className="bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] px-2 py-1 rounded-sm w-full min-h-[60px] resize-y"
                autoFocus
              />
              <div className="flex gap-1 mt-1">
                <button
                  onClick={() => void handleSave(msg.id)}
                  className="bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-none px-3 py-1.5 cursor-pointer rounded-sm"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] border-none px-3 py-1.5 cursor-pointer rounded-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="whitespace-pre-wrap">{msg.body}</div>
              <div className="flex gap-1 mt-1 opacity-50">
                <button
                  onClick={() => { setEditingId(msg.id); setEditBody(msg.body); }}
                  className="bg-transparent border-none cursor-pointer px-1 py-0.5"
                >
                  <span className="codicon codicon-edit" />
                </button>
                <button
                  onClick={() => void handleDelete(msg.id)}
                  className="bg-transparent border-none cursor-pointer px-1 py-0.5"
                >
                  <span className="codicon codicon-trash" />
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
    <div className="px-4 py-2 border-t border-[var(--vscode-panel-border)] flex gap-2">
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
        className="bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] px-2 py-1 rounded-sm flex-1 min-h-[40px] resize-y"
      />
      <button
        onClick={() => void handleSend()}
        disabled={loading || !body.trim()}
        className="bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-none px-3 py-1.5 cursor-pointer rounded-sm"
      >
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
    <div className="p-2">
      <div className="font-semibold mb-2">TODOs</div>
      <div className="flex gap-1 mb-2">
        <input
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Add TODO..."
          onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
          className="bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] px-2 py-1 rounded-sm flex-1"
        />
        <button
          onClick={() => void handleAdd()}
          className="bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-none px-3 py-1.5 cursor-pointer rounded-sm"
        >
          +
        </button>
      </div>
      <ul className="list-none">
        {todos.map((todo) => (
          <li key={todo.id} className="flex items-center gap-1 py-1">
            <input
              type="checkbox"
              checked={todo.completedAt != null}
              onChange={() => void handleToggle(todo.id, todo.completedAt == null)}
            />
            <span className={`flex-1 ${todo.completedAt ? "line-through opacity-50" : ""}`}>
              {todo.content}
            </span>
            <button
              onClick={() => void handleDelete(todo.id)}
              className="bg-transparent border-none cursor-pointer px-1 py-0.5"
            >
              ×
            </button>
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
    <div className="p-2 border-t border-[var(--vscode-panel-border)]">
      <div className="font-semibold mb-2">Bookmarks</div>
      <div className="flex gap-1 mb-2">
        <input
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="Add URL..."
          onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
          className="bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] px-2 py-1 rounded-sm flex-1"
        />
        <button
          onClick={() => void handleAdd()}
          disabled={loading}
          className="bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-none px-3 py-1.5 cursor-pointer rounded-sm"
        >
          +
        </button>
      </div>
      <ul className="list-none">
        {bookmarks.map((bm) => (
          <li key={bm.id} className="py-1.5 border-b border-[var(--vscode-panel-border)]">
            <div className="flex items-center gap-1">
              <a
                href={bm.url}
                className="text-[var(--vscode-textLink-foreground)] flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
              >
                {bm.title || bm.url}
              </a>
              <button
                onClick={() => void handleDelete(bm.id)}
                className="bg-transparent border-none cursor-pointer px-1 py-0.5"
              >
                ×
              </button>
            </div>
            {bm.description && (
              <div className="text-sm opacity-70 mt-0.5">
                {bm.description}
              </div>
            )}
            <div className="text-xs opacity-50">{bm.domain}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
