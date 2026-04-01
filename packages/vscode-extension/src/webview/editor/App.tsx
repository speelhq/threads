import { useState, useEffect, useRef } from "react";
import { useCommand } from "../hooks/useCommand.js";
import { Markdown } from "../components/Markdown.js";
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
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [showSidePanel, setShowSidePanel] = useState(false);
  const { execute: fetchThread, loading } = useCommand<ThreadDetail>("threads.get");
  const messageListRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void loadThread();
  }, []);

  async function loadThread() {
    try {
      const result = await fetchThread({ id: threadId });
      setThread(result);
    } catch {}
  }

  function enterNavigation() {
    if (!thread || thread.messages.length === 0) return;
    const last = thread.messages[thread.messages.length - 1]!;
    setSelectedMsgId(last.id);
    messageListRef.current?.focus();
  }

  function focusInput() {
    setSelectedMsgId(null);
    inputRef.current?.focus();
  }

  // Global "/" shortcut to focus input
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "/") {
        e.preventDefault();
        focusInput();
      }
    }
    document.addEventListener("keydown", handleGlobalKey);
    return () => document.removeEventListener("keydown", handleGlobalKey);
  }, []);

  if (loading && !thread) {
    return <div className="p-4 opacity-50">Loading...</div>;
  }

  if (!thread) {
    return <div className="p-4">Thread not found</div>;
  }

  return (
    <div className="flex h-screen">
      <div className="flex-1 flex flex-col overflow-hidden">
        <ThreadHeader thread={thread} onUpdate={loadThread} showSidePanel={showSidePanel} onToggleSidePanel={() => setShowSidePanel((v) => !v)} />
        <MessageList
          messages={thread.messages}
          selectedId={selectedMsgId}
          onSelect={setSelectedMsgId}
          onUpdate={loadThread}
          onFocusInput={focusInput}
          listRef={messageListRef}
        />
        <MessageInput
          threadId={threadId}
          onSend={loadThread}
          onNavigateUp={enterNavigation}
          inputRef={inputRef}
        />
      </div>
      {showSidePanel && (
        <div className="w-[280px] shrink-0 border-l border-[var(--vscode-panel-border)] overflow-auto">
          <TodoPanel todos={thread.todos} threadId={threadId} onUpdate={loadThread} />
          <BookmarkPanel bookmarks={thread.bookmarks} threadId={threadId} onUpdate={loadThread} />
        </div>
      )}
    </div>
  );
}

// ── Header ──

function ThreadHeader({
  thread,
  onUpdate,
  showSidePanel,
  onToggleSidePanel,
}: {
  thread: ThreadDetail;
  onUpdate: () => Promise<void>;
  showSidePanel: boolean;
  onToggleSidePanel: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(thread.title);
  useEffect(() => { setTitle(thread.title); }, [thread.title]);
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
    } catch {}
  }

  async function handleDelete() {
    try {
      await deleteThread({ id: thread.id });
    } catch {}
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
        onClick={onToggleSidePanel}
        className="bg-transparent border-none cursor-pointer px-1 py-0.5"
        title={showSidePanel ? "Hide panel" : "Show panel"}
      >
        <span className={`codicon codicon-layout-sidebar-right${showSidePanel ? "" : "-off"}`} />
      </button>
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
  selectedId,
  onSelect,
  onUpdate,
  onFocusInput,
  listRef,
}: {
  messages: MessageItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: () => Promise<void>;
  onFocusInput: () => void;
  listRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const { execute: updateMessage } = useCommand<MessageItem>("messages.update");
  const { execute: deleteMessage } = useCommand("messages.delete");
  const prevCountRef = useRef(messages.length);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  const selectedIndex = selectedId ? messages.findIndex((m) => m.id === selectedId) : -1;

  async function handleSave(id: string) {
    if (editBody.trim()) {
      try {
        await updateMessage({ id, body: editBody.trim() });
        await onUpdate();
      } catch {}
    }
    setEditingId(null);
    listRef.current?.focus();
  }

  async function handleDelete() {
    if (!selectedId) return;
    // Compute next selection before deleting
    const adjacent = messages[selectedIndex + 1] ?? messages[selectedIndex - 1];
    const nextId = adjacent?.id ?? null;
    try {
      await deleteMessage({ id: selectedId });
      onSelect(nextId);
      await onUpdate();
    } catch {}
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (editingId) return;

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        if (selectedIndex > 0) {
          onSelect(messages[selectedIndex - 1]!.id);
        } else if (selectedIndex === -1 && messages.length > 0) {
          onSelect(messages[messages.length - 1]!.id);
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < messages.length - 1) {
          onSelect(messages[selectedIndex + 1]!.id);
        } else if (selectedIndex === messages.length - 1) {
          onFocusInput();
        }
        break;
      case "e":
        e.preventDefault();
        if (selectedId) {
          const msg = messages.find((m) => m.id === selectedId);
          if (msg) { setEditingId(msg.id); setEditBody(msg.body); }
        }
        break;
      case "Delete":
        e.preventDefault();
        if (selectedId) {
          void handleDelete();
        }
        break;
      case "Escape":
        e.preventDefault();
        onSelect(null);
        break;
    }
  }

  useEffect(() => {
    if (!selectedId) return;
    const el = listRef.current?.querySelector(`[data-msg-id="${selectedId}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedId, editingId]);

  return (
    <div
      ref={listRef}
      className="flex-1 overflow-auto py-2 outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {messages.length === 0 && (
        <div className="py-12 px-4 text-center opacity-30 text-sm">Write your first message</div>
      )}
      {messages.map((msg) => (
        <div
          key={msg.id}
          data-msg-id={msg.id}
          className={`py-2 px-4 border-b border-[var(--vscode-panel-border)] last:border-b-0 cursor-pointer ${
            selectedId === msg.id ? "bg-[var(--vscode-list-hoverBackground)]" : ""
          }`}
          onClick={() => onSelect(msg.id)}
        >
          {editingId === msg.id ? (
            <div>
              <textarea
                value={editBody}
                onChange={(e) => {
                  setEditBody(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                }}
                ref={(el) => {
                  if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
                }}
                className="bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] px-2 py-1 rounded-sm w-full min-h-[60px] resize-y overflow-hidden"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") { e.stopPropagation(); setEditingId(null); listRef.current?.focus(); }
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void handleSave(msg.id); }
                }}
              />
              <div className="mt-1 text-xs opacity-50">
                Ctrl+Enter to save · Escape to cancel
              </div>
            </div>
          ) : (
            <div className="prose"><Markdown content={msg.body} /></div>
          )}
        </div>
      ))}
    </div>
  );
}

function MessageInput({
  threadId,
  onSend,
  onNavigateUp,
  inputRef,
}: {
  threadId: string;
  onSend: () => Promise<void>;
  onNavigateUp: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [body, setBody] = useState("");
  const { execute: createMessage, loading } = useCommand<MessageItem>("messages.create");

  async function handleSend() {
    if (!body.trim()) return;
    try {
      await createMessage({ threadId, body: body.trim() });
      setBody("");
      await onSend();
    } catch {}
  }

  return (
    <div className="px-4 py-2 border-t border-[var(--vscode-panel-border)] flex gap-2">
      <textarea
        ref={inputRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a message..."
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onNavigateUp();
          }
          if (e.key === "ArrowUp" && !body) {
            e.preventDefault();
            onNavigateUp();
          }
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
    } catch {}
  }

  async function handleToggle(id: string, completed: boolean) {
    try { await updateTodo({ id, completed }); await onUpdate(); } catch {}
  }

  async function handleDelete(id: string) {
    try { await deleteTodo({ id }); await onUpdate(); } catch {}
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
    } catch {}
  }

  async function handleDelete(id: string) {
    try { await deleteBookmark({ id }); await onUpdate(); } catch {}
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
              <div className="text-sm opacity-70 mt-0.5">{bm.description}</div>
            )}
            <div className="text-xs opacity-50">{bm.domain}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
