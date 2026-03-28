# VS Code Extension

受講生がVS Code上でスレッドベースのメモを取り、TODO・ブックマーク・タグで整理する。講義中のメモ環境をVS Codeに統一し、コード編集とメモ書きを同一エディタで完結させる。

---

## Requirements

### メモ機能（Phase 2）

- 受講生はVS Codeのサイドバーからスレッド一覧を閲覧し、新規スレッドを作成できる。
- スレッドをクリックするとエディタタブに詳細が開き、メッセージの追加・編集・削除・並び替えができる。
- スレッドにTODOを追加し、完了/未完了をトグルできる。全スレッド横断の未完了TODO一覧をサイドバーで確認できる。
- スレッドにブックマークを追加できる。OGPプレビューが表示される。
- スレッドにタグを付与・解除できる。タグでスレッド一覧をフィルタできる。
- スレッドのピン留め/解除ができ、ピン留めスレッドが一覧上部に固定される。
- メールアドレスとパスワードでログインし、認証状態が永続化される。

### コード提出機能（Phase 4）

- 受講生はエディタで開いているファイルを右クリックまたはコマンドパレットから提出できる。
- 課題の選択、複数ファイルの同時提出、revision番号の自動表示ができる。
- 提出履歴とレビューコメントを閲覧できる。

Phase 4の詳細仕様は`assignments.md`の画面セクションを参照。

---

## Architecture

### Extension Host / Webview

VS Code拡張は2つの実行環境で動く。

**Extension Host**（Node.js）:
- VS Code APIの呼び出し（コマンド登録、パネル管理、SecretStorage等）
- REST APIとのHTTP通信
- 認証トークンの管理
- 複数Webviewの状態同期

**Webview**（ブラウザサンドボックス）:
- ReactによるUIの描画
- Extension Hostとの通信はpostMessageのみ（直接fetchしない）

Webviewは複数同時に存在する:
- **サイドバー**（WebviewView）— 1インスタンス、常時表示
- **エディタタブ**（WebviewPanel）— スレッドごとに開閉、複数同時に開ける

Extension Hostが唯一のデータソースであり、全Webviewはデータ取得・更新をExtension Host経由で行う。あるWebviewでの変更は、Extension Hostが他のWebviewにイベントとしてプッシュする。

### Build

2段構成。

| 対象 | ツール | ターゲット |
|---|---|---|
| Extension Host | esbuild | Node.js（CommonJS） |
| Webview | Vite | ブラウザ（ESM） |

GitHub Nextのテンプレート（vscode-react-webviews）をベースにする。

### Package Structure

```
packages/vscode-extension/
├── src/
│   ├── extension/        # Extension Host側のコード
│   │   ├── activate.ts   # エントリポイント
│   │   ├── auth.ts       # AuthManager
│   │   ├── api.ts        # ApiClient
│   │   ├── sidebar.ts    # サイドバーWebviewView
│   │   ├── editor.ts     # エディタタブWebviewPanel
│   │   └── commands.ts   # コマンド登録
│   ├── webview/          # Webview側のコード（React）
│   │   ├── sidebar/      # サイドバーUI
│   │   ├── editor/       # エディタタブUI
│   │   ├── components/   # 共通UIコンポーネント
│   │   └── hooks/        # 共通hooks（useCommand等）
│   └── protocol/         # メッセージプロトコル型定義（両環境で共有）
│       └── index.ts
├── package.json
└── tsconfig.json
```

`@threads/shared`の型はExtension Host側で直接importする。Webview側はメッセージプロトコル経由でデータを受け取るため、`@threads/shared`に直接依存しない。Webview側で使う型は`protocol/`に定義し、必要に応じて`@threads/shared`の型をre-exportする。

---

## Design Decisions

### 認証はブラウザリダイレクトで行う

**判断**: サイドバーに「Googleでログイン」ボタンを表示し、ブラウザでGoogle認証を完了後、URIハンドラー（`vscode://threads.threads/auth-callback`）でVS Codeに戻る。

**理由**: Google OAuthにはブラウザが必要。VS Code拡張の標準的な認証パターン。認証フローはAuthManagerクラスに閉じ込める。

### Webviewからは直接APIを叩かない

**判断**: Webviewは全てのデータ取得・更新をExtension Host経由で行う。

**理由**: トークンをWebviewに渡さずにSecretStorageで管理するため。複数Webviewが同時に存在するため、Extension Hostを唯一のデータソースにして状態の不整合を防ぐ。

### 状態管理はReact Context

**判断**: Webview側の状態管理にはReact Contextを使う。外部ライブラリは導入しない。

**理由**: Webview側のローカル状態は限定的。データの正規化やキャッシュはExtension Host側の責務であり、Webview側は受け取ったデータを描画するだけ。

### VS Codeテーマに合わせたスタイリング

**判断**: UIコンポーネントライブラリ（Shadcn/Radix UI等）は使わず、Tailwind CSSとVS CodeのCSS変数（`--vscode-*`）を組み合わせて使用する。

**理由**: WebviewはVS Code内のiframeで動く。CSS変数を使うことで、ユーザーが選択したテーマに自動的に適応する。Tailwind CSSはユーティリティCSSであり、hover/focus等の状態やトランジションを宣言的に扱える。ビルド時にCSSを生成するためランタイムコストがない。

### Extension HostではFirebase SDKを使わない

**判断**: Extension Hostではトークンリフレッシュのみ必要で、Firebase REST APIを直接呼ぶ。Firebase Client SDK・Admin SDKは導入しない。認証コールバックページ（ブラウザ側）ではFirebase Client SDKを使用する。

**理由**: Client SDKはブラウザ環境前提でExtension Host（Node.js）ではセッション永続化が動作しない。Admin SDKは管理者権限が必要でクライアント用途には不適切。

---

## Auth Flow

Google認証のみ。Firebase AuthのGoogleプロバイダを使用する。

### コンポーネント

| コンポーネント | 役割 |
|---|---|
| 認証コールバックページ | Firebase Hosting等でホストする静的HTML。Firebase Client SDKでGoogleログインを実行し、取得したトークンをVS CodeのURIスキームにリダイレクトする |
| Extension Host（AuthManager） | URIハンドラーでトークンを受信、SecretStorageに保存、API通信、全Webviewへの通知 |
| サイドバーWebview | 「Googleでログイン」ボタン表示、認証状態に応じた画面切替 |

### トークン

| トークン | 寿命 | 保存先 | 用途 |
|---|---|---|---|
| ID Token | 1時間 | メモリ（Extension Host） | API認証（Bearerヘッダー） |
| Refresh Token | 長期間 | SecretStorage | ID Tokenの更新 |

### 認証状態

| 状態 | 条件 | サイドバー表示 |
|---|---|---|
| `unauthenticated` | トークンなし | 「Googleでログイン」ボタン |
| `authenticating` | ブラウザ認証待ちまたはトークン復元中 | ローディング |
| `authenticated` | 有効なID Token保持中 | スレッド一覧 |
| `token_expired` | API 401受信、リフレッシュ試行中 | （表示変更なし、バックグラウンド処理） |

### 状態遷移

| 現在の状態 | トリガー | 次の状態 |
|---|---|---|
| `unauthenticated` | ユーザーが「Googleでログイン」クリック | `authenticating` |
| `unauthenticated` | 拡張起動時、SecretStorageにRefresh Tokenあり | `authenticating` |
| `authenticating` | URIハンドラーでトークン受信 + API成功 | `authenticated` |
| `authenticating` | 認証失敗またはタイムアウト | `unauthenticated`（エラー表示） |
| `authenticated` | API呼び出しで401 | `token_expired` |
| `authenticated` | ユーザーがログアウト | `unauthenticated` |
| `token_expired` | Refresh Tokenで新ID Token取得成功 | `authenticated`（元のAPIリクエストをリトライ） |
| `token_expired` | Refresh Token無効 | `unauthenticated`（全Webviewに通知） |

### シーケンス

**初回ログイン**:
1. Webviewがメッセージ送信: `auth.login`
2. Extension Hostがランダムな`state`を生成し、認証コールバックページのURLに付与
3. `vscode.env.openExternal`でブラウザを開く
4. ブラウザ上で認証コールバックページがFirebase Client SDKでGoogleログインを実行
5. ログイン成功 → ページが`vscode://threads.threads/auth-callback?idToken=xxx&refreshToken=yyy&state=zzz`にリダイレクト
6. Extension HostのURIハンドラーがトークンを受信、`state`を検証
7. Refresh TokenをSecretStorageに保存、ID Tokenをメモリに保持
8. API `POST /auth/login`を呼び出し → `USER_NOT_FOUND`なら`POST /auth/signup`を自動呼び出し（display_nameはFirebaseトークンから取得）
9. 全Webviewに `auth.stateChanged { user, cohorts }` イベントをプッシュ

**拡張起動時（トークン復元）**:
1. SecretStorageからRefresh Tokenを取得
2. 存在すれば → Firebase REST API `token`でID Tokenを取得
3. API `POST /auth/login`でユーザー情報を取得
4. 全Webviewに `auth.stateChanged` をプッシュ

**ログアウト**:
1. SecretStorageからRefresh Tokenを削除
2. メモリのID Tokenをクリア
3. 全Webviewに `auth.stateChanged { user: null }` をプッシュ

### Firebase REST APIエンドポイント

| 操作 | URL | キーパラメータ |
|---|---|---|
| トークンリフレッシュ | `POST /v1/token?key={API_KEY}` | grant_type=refresh_token, refresh_token |

ログインはブラウザ上の認証コールバックページが処理するため、Extension HostからのFirebase REST API呼び出しはトークンリフレッシュのみ。`API_KEY`はFirebaseプロジェクトのWeb API Key。

---

## API Client

Extension Host内のHTTPクライアント。REST APIとの通信を担う。

### 責務

- Base URLの管理（設定で変更可能、デフォルト: `http://localhost:3000`）
- 全リクエストにID Tokenを`Authorization: Bearer`ヘッダーとして付与
- 401レスポンス時のトークンリフレッシュ＋リトライ（1回）
- レスポンスの型変換（JSON → `@threads/shared`の型）
- ネットワークエラー・タイムアウトのラップ

### Interface

```typescript
class ApiClient {
  constructor(config: {
    baseUrl: string;
    getToken: () => Promise<string | null>;
    onUnauthorized: () => Promise<string | null>;  // リフレッシュ試行、新トークンを返す
  });

  // Auth
  login(): Promise<LoginResponse>;
  getMe(): Promise<LoginResponse>;

  // Threads
  listThreads(params?: { tagId?: string; search?: string; cursor?: string; limit?: number }): Promise<ListThreadsResponse>;
  getThread(id: string): Promise<ThreadDetailResponse>;
  createThread(body: CreateThreadRequest): Promise<ThreadResponse>;
  updateThread(id: string, body: UpdateThreadRequest): Promise<ThreadResponse>;
  deleteThread(id: string): Promise<void>;

  // Messages
  createMessage(threadId: string, body: CreateMessageRequest): Promise<MessageResponse>;
  updateMessage(id: string, body: UpdateMessageRequest): Promise<MessageResponse>;
  deleteMessage(id: string): Promise<void>;
  reorderMessages(threadId: string, body: ReorderMessagesRequest): Promise<ReorderMessagesResponse>;

  // TODOs
  listCrossThreadTodos(params: { completed: boolean; cursor?: string; limit?: number }): Promise<CrossThreadTodosResponse>;
  createTodo(threadId: string, body: CreateTodoRequest): Promise<TodoResponse>;
  updateTodo(id: string, body: UpdateTodoRequest): Promise<TodoResponse>;
  deleteTodo(id: string): Promise<void>;

  // Bookmarks
  createBookmark(threadId: string, body: CreateBookmarkRequest): Promise<BookmarkResponse>;
  updateBookmark(id: string, body: UpdateBookmarkRequest): Promise<BookmarkResponse>;
  deleteBookmark(id: string): Promise<void>;

  // Tags
  listTags(params: { cohortId: string }): Promise<ListTagsResponse>;
  createTag(body: CreateTagRequest): Promise<TagResponse>;
  addThreadTag(threadId: string, tagId: string): Promise<ThreadTagResponse>;
  removeThreadTag(threadId: string, tagId: string): Promise<void>;
}
```

### Error

ApiClientは全てのHTTPエラーを`ApiError`として統一する。Webview側にはメッセージプロトコルのerrorフィールドとして伝播する。

```typescript
class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public message: string,
  ) { super(message); }
}
```

---

## Message Protocol

Extension Host ↔ Webview間の通信プロトコル。`postMessage`で送受信するメッセージの型定義。

### メッセージ構造

```typescript
/** Webview → Extension Host */
type RequestMessage = {
  type: 'request';
  id: string;         // リクエストID（UUID）。レスポンスとの対応付けに使う
  command: string;
  payload?: unknown;
};

/** Extension Host → Webview（リクエストへの応答） */
type ResponseMessage = {
  type: 'response';
  id: string;         // 対応するリクエストID
  data?: unknown;
  error?: { code: string; message: string };
};

/** Extension Host → Webview（プッシュ通知） */
type EventMessage = {
  type: 'event';
  event: string;
  payload?: unknown;
};

type Message = RequestMessage | ResponseMessage | EventMessage;
```

### Commands

Webview → Extension Hostのリクエスト。

**認証**:

| command | payload | response data | error codes |
|---|---|---|---|
| `auth.login` | — | — （ブラウザが開く。結果は`auth.stateChanged`イベントで通知） | `NETWORK_ERROR` |
| `auth.logout` | — | — | — |

**スレッド**:

| command | payload | response data | error codes |
|---|---|---|---|
| `threads.list` | `{ tagId?: string; search?: string; cursor?: string; limit?: number }` | `{ threads: ThreadSummary[]; nextCursor: string \| null }` | `NETWORK_ERROR` |
| `threads.get` | `{ id: string }` | `ThreadDetail` | `NOT_FOUND`, `NETWORK_ERROR` |
| `threads.create` | `{ title: string; tagIds?: string[] }` | `ThreadSummary` | `VALIDATION_ERROR`, `NO_ACTIVE_COHORT`, `INVALID_TAG`, `NETWORK_ERROR` |
| `threads.update` | `{ id: string; title?: string; pinned?: boolean }` | `ThreadSummary` | `NOT_FOUND`, `VALIDATION_ERROR`, `NETWORK_ERROR` |
| `threads.delete` | `{ id: string }` | — | `NOT_FOUND`, `NETWORK_ERROR` |

**メッセージ**:

| command | payload | response data | error codes |
|---|---|---|---|
| `messages.create` | `{ threadId: string; body: string }` | `Message` | `NOT_FOUND`, `VALIDATION_ERROR`, `NETWORK_ERROR` |
| `messages.update` | `{ id: string; body: string }` | `Message` | `NOT_FOUND`, `VALIDATION_ERROR`, `NETWORK_ERROR` |
| `messages.delete` | `{ id: string }` | — | `NOT_FOUND`, `NETWORK_ERROR` |
| `messages.reorder` | `{ threadId: string; messageIds: string[] }` | `{ messages: { id: string; position: number }[] }` | `NOT_FOUND`, `INVALID_MESSAGE_IDS`, `INCOMPLETE_MESSAGE_IDS`, `NETWORK_ERROR` |

**TODO**:

| command | payload | response data | error codes |
|---|---|---|---|
| `todos.listCrossThread` | `{ completed: boolean; cursor?: string; limit?: number }` | `{ todos: CrossThreadTodo[]; nextCursor: string \| null }` | `NETWORK_ERROR` |
| `todos.create` | `{ threadId: string; content: string }` | `Todo` | `NOT_FOUND`, `VALIDATION_ERROR`, `NETWORK_ERROR` |
| `todos.update` | `{ id: string; content?: string; completed?: boolean }` | `Todo` | `NOT_FOUND`, `VALIDATION_ERROR`, `NETWORK_ERROR` |
| `todos.delete` | `{ id: string }` | — | `NOT_FOUND`, `NETWORK_ERROR` |

**ブックマーク**:

| command | payload | response data | error codes |
|---|---|---|---|
| `bookmarks.create` | `{ threadId: string; url: string }` | `Bookmark` | `NOT_FOUND`, `INVALID_URL`, `NETWORK_ERROR` |
| `bookmarks.update` | `{ id: string; title?: string; description?: string }` | `Bookmark` | `NOT_FOUND`, `NETWORK_ERROR` |
| `bookmarks.delete` | `{ id: string }` | — | `NOT_FOUND`, `NETWORK_ERROR` |

**タグ**:

| command | payload | response data | error codes |
|---|---|---|---|
| `tags.list` | `{ cohortId: string }` | `{ tags: Tag[] }` | `NETWORK_ERROR` |
| `tags.create` | `{ name: string }` | `Tag` | `VALIDATION_ERROR`, `TAG_ALREADY_EXISTS`, `NETWORK_ERROR` |
| `threads.addTag` | `{ threadId: string; tagId: string }` | `{ threadId: string; tagId: string; createdAt: string }` | `NOT_FOUND`, `INVALID_TAG`, `ALREADY_TAGGED`, `NETWORK_ERROR` |
| `threads.removeTag` | `{ threadId: string; tagId: string }` | — | `NOT_FOUND`, `NETWORK_ERROR` |

全コマンド共通: `UNAUTHORIZED`（トークンリフレッシュ後も認証失敗した場合。通常はApiClientが自動処理するためWebviewには到達しない）。

### Events

Extension Host → Webviewのプッシュ通知。複数Webview間の同期に使う。

| event | payload | 発火タイミング |
|---|---|---|
| `auth.stateChanged` | `{ user: User \| null; cohorts: UserCohort[] \| null }` | ログイン/ログアウト/トークン復元 |
| `threads.created` | `ThreadSummary` | スレッドが作成された |
| `threads.updated` | `ThreadSummary` | スレッドが更新された（他Webviewから） |
| `threads.deleted` | `{ id: string }` | スレッドが削除された |

### Webview Helper

Webview側はリクエスト/レスポンスの対応付けをラップする`useCommand`フックを提供する。

```typescript
function useCommand<T>(command: string): {
  execute: (payload?: unknown) => Promise<T>;
  loading: boolean;
  error: { code: string; message: string } | null;
};

// 使用例
const { execute, loading, error } = useCommand<ListThreadsResponse>('threads.list');
const result = await execute({ search: 'JavaScript' });
```

---

## Screens

### 認証

**未認証時**: サイドバーに「Googleでログイン」ボタンを表示。エラーメッセージ表示領域。

**認証処理中**: ローディング表示。ブラウザでの認証完了を待つ。

**認証済み**: サイドバーがスレッド一覧に切り替わる。ステータスバーにユーザー名を表示。

### サイドバー（WebviewView）

サイドバーは2つのビューを切り替える: **スレッド一覧**と**横断TODO一覧**。

**スレッド一覧**:
- 各スレッド: タイトル、タグ（バッジ表示）、未完了TODO数、ピン留めアイコン
- ピン留めされたスレッドが上部に固定
- 「+ 新規スレッド」ボタン
- タグフィルタ（ドロップダウン。プリセットタグ・カスタムタグ）
- 検索ボックス（スレッドタイトルで検索）
- スレッドをクリック → エディタタブに詳細を開く

**横断TODO一覧**:
- 全スレッドの未完了TODOを一覧表示
- 各TODOにスレッド名のラベル付き
- チェックで完了/未完了トグル
- クリックでそのスレッドのエディタタブにジャンプ

### エディタタブ（WebviewPanel）

スレッドごとに1タブ。複数スレッドを同時に開ける。

**ヘッダー**: スレッドタイトル（編集可能）、タグ一覧（追加・削除可能）、ピン留めトグル

**メインエリア**: メッセージの時系列表示（上→下）。各メッセージはMarkdownレンダリング。各メッセージに編集・削除アクション。

**メッセージ入力欄**: 下部に固定。テキストエリア＋送信ボタン。

**右サイドパネルまたはタブ切替**:
- TODO一覧（このスレッド内。追加・完了トグル・削除）
- ブックマーク一覧（このスレッド内。OGPプレビュー付き。追加・削除）

### レイアウト

左サイドバーにスレッド一覧。エディタ領域のタブにスレッド詳細を開く。VS Codeのsplit editor機能で、左半分にコード、右半分にメモタブという配置を想定。

### 制約

- WebviewはVS Code内のiframeで動く。Shadcnは使わず、VS CodeのCSS変数（`--vscode-editor-background`, `--vscode-foreground`等）に合わせる。
- スレッド削除時は確認ダイアログを表示する。「このスレッドと配下のメッセージ・TODO・ブックマークが全て削除されます」の旨を伝える。

---

## Open Issues

- 認証コールバックページのホスティング先が未決定。Firebase Hosting、Cloud Run、またはGitHub Pagesが候補。開発段階ではlocalhostで静的ファイルを配信する。
- Firebase API Keyの注入方法が未決定。Firebase API Keyは公開前提のため、ソースに埋め込みで開発段階は進める。配布時に設定経由に切り替えるか決定する。
- Webview間の状態同期の粒度が未決定。初期実装はイベント受信時にリスト全件を再取得する方式で進め、パフォーマンス問題が出た場合に差分更新に移行する。
- オフライン時の振る舞いが未定義。研修環境はネットワーク接続前提のため、初期実装ではエラー表示のみとする。
- Markdownレンダリングライブラリが未選定。VS Code内蔵のMarkdownレンダリングを利用するか、react-markdown等をWebviewにバンドルするか。
- Webviewのアクセシビリティ対応（キーボードナビゲーション、スクリーンリーダー等）が未定義。VS Code拡張のガイドラインに沿って実装時に対応する。
- タグ一覧のロードが未実装。cohortIdの取得方法（認証状態から）を決めて、サイドバーのタグフィルタを有効化する必要がある。
- スレッド作成時のタイトル入力UIが未実装。現在は「New Thread」固定。
- エディタタブのタグ追加・削除UIが未実装。表示のみ。
- エディタタブがthreads.updated/deletedイベントを受信しない。サイドバーからの削除時にタブが残る。
- Marketplace配布準備が未対応。`private: true`の削除、`publisher`フィールド追加、`@threads/shared`をdevDependenciesに移動、`.vscodeignore`の作成が必要。動作確認後に対応する。
