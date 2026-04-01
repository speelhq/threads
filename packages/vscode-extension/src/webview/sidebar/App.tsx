import { useState, useEffect } from "react";
import { onEvent, useCommand } from "../hooks/useCommand.js";
import type { ThreadSummary, Tag } from "../../protocol/index.js";

export function App() {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    return onEvent("auth.stateChanged", (payload) => {
      const p = payload as { user: unknown } | undefined;
      setAuthenticated(p?.user != null);
    });
  }, []);

  if (!authenticated) {
    return <LoginView />;
  }

  return <MainView />;
}

function LoginView() {
  const { execute, loading, error } = useCommand("auth.login");

  return (
    <div className="flex flex-col items-center justify-center h-screen px-5 gap-2">
      <p className="text-sm opacity-60 m-0 mb-3">Sign in to start taking notes</p>
      <button
        className="w-full py-1.5 bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-none rounded cursor-pointer text-sm hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50 disabled:cursor-default"
        onClick={() => void execute()}
        disabled={loading}
      >
        {loading ? "Opening browser..." : "Sign in with Google"}
      </button>
      {error && <p className="text-[var(--vscode-errorForeground)] text-xs m-0">{error.message}</p>}
    </div>
  );
}

function MainView() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [threadsByTag, setThreadsByTag] = useState<Record<string, ThreadSummary[]>>({});
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
  const { execute: fetchTags } = useCommand<{ tags: Tag[] }>("tags.list");
  const { execute: fetchThreads } = useCommand<{ threads: ThreadSummary[]; nextCursor: string | null }>("threads.list");
  const { execute: createThread } = useCommand<ThreadSummary>("threads.create");
  const { execute: openThread } = useCommand("threads.open");

  useEffect(() => {
    void loadData();
    return onEvent("threads.created", () => void loadThreads());
  }, []);

  useEffect(() => {
    return onEvent("threads.updated", () => void loadThreads());
  }, []);

  useEffect(() => {
    return onEvent("threads.deleted", () => void loadThreads());
  }, []);

  async function loadData() {
    try {
      const result = await fetchTags({ cohortId: "dev-cohort-1" });
      setTags(result.tags);
      if (result.tags.length > 0) {
        setExpandedTags(new Set([result.tags[0]!.id]));
      }
    } catch {}
    await loadThreads();
  }

  async function loadThreads() {
    try {
      const result = await fetchThreads({});
      const grouped: Record<string, ThreadSummary[]> = {};
      for (const thread of result.threads) {
        const tagId = thread.tags[0]?.id ?? "untagged";
        if (!grouped[tagId]) grouped[tagId] = [];
        grouped[tagId]!.push(thread);
      }
      setThreadsByTag(grouped);
    } catch {}
  }

  function toggleTag(tagId: string) {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  async function handleNewThread() {
    const firstExpandedTag = tags.find((t) => expandedTags.has(t.id));
    const tagId = firstExpandedTag?.id ?? tags[0]?.id;
    try {
      const thread = await createThread({ title: "New Thread", tag_ids: tagId ? [tagId] : [] });
      await loadThreads();
      void openThread({ id: thread.id, title: thread.title });
    } catch {}
  }

  function formatTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  return (
    <div className="flex flex-col h-screen text-[13px]">
      {/* New Thread button */}
      <div className="px-3 pt-3 pb-2">
        <button
          className="w-full flex items-center gap-1.5 px-2 py-1.5 bg-transparent border border-[var(--vscode-input-border)] rounded cursor-pointer text-[var(--vscode-foreground)] text-xs opacity-70 hover:opacity-100 hover:bg-[var(--vscode-list-hoverBackground)]"
          onClick={() => void handleNewThread()}
        >
          <span className="codicon codicon-add text-xs" />
          New Thread
        </button>
      </div>

      {/* Tag tree */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wider opacity-50">
          Workspaces
        </div>
        {tags.map((tag) => {
          const expanded = expandedTags.has(tag.id);
          const threads = threadsByTag[tag.id] ?? [];
          return (
            <div key={tag.id}>
              <div
                className="flex items-center gap-1 px-3 py-1 cursor-pointer opacity-80 hover:opacity-100 hover:bg-[var(--vscode-list-hoverBackground)]"
                onClick={() => toggleTag(tag.id)}
              >
                <span className={`codicon codicon-chevron-${expanded ? "down" : "right"} text-[10px] opacity-60`} />
                <span className="flex-1 font-medium">{tag.name}</span>
                {threads.length > 0 && (
                  <span className="text-[10px] opacity-40">{threads.length}</span>
                )}
              </div>
              {expanded && (
                <div>
                  {threads.map((thread) => (
                    <div
                      key={thread.id}
                      className="flex items-center gap-1 pl-7 pr-3 py-1 cursor-pointer opacity-70 hover:opacity-100 hover:bg-[var(--vscode-list-hoverBackground)]"
                      onClick={() => void openThread({ id: thread.id, title: thread.title })}
                    >
                      <span className="flex-1 truncate">{thread.title}</span>
                      <span className="text-[10px] opacity-40 shrink-0">{formatTime(thread.updatedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer menu */}
      <div className="border-t border-[var(--vscode-panel-border)] px-3 py-2 flex flex-col gap-0.5">
        <button
          className="flex items-center gap-2 w-full px-1 py-1 bg-transparent border-none cursor-pointer text-[var(--vscode-foreground)] opacity-70 hover:opacity-100 hover:bg-[var(--vscode-list-hoverBackground)] rounded text-xs"
          onClick={() => void openThread({ id: "__todos__", title: "TODOs" })}
        >
          <span className="codicon codicon-checklist text-sm" />
          Todos
        </button>
        <button
          className="flex items-center gap-2 w-full px-1 py-1 bg-transparent border-none cursor-pointer text-[var(--vscode-foreground)] opacity-70 hover:opacity-100 hover:bg-[var(--vscode-list-hoverBackground)] rounded text-xs"
        >
          <span className="codicon codicon-gear text-sm" />
          Settings
        </button>
      </div>
    </div>
  );
}
