# 研修プラットフォーム — プロダクト概要と設計判断

## 1. プロダクト概要

### 何を作るか

エンジニア研修の受講生と講師のためのツール群。カリキュラムはJavaScript、Java、データベース等を含む。受講生の学習環境をVS Codeに統一し、コード提出・メモ・TODO・ブックマーク管理を一つの拡張機能で完結させる。講師にはコードレビューと、学習データの分析基盤を提供する。

教育ドメインでのポジションを確立するために、データ分析には力を入れる。受講生の学習行動データを蓄積し、カリキュラム改善のサイクルを回すことがプロダクトの核心的な価値である。

### 誰のためか

- **受講生（student）** — JavaScript、Java、データベース等を学ぶ。完全初心者から経験者まで混在する。
- **講師（instructor）** — コードレビューと受講生の傾向把握を行う。
- **運営（admin）** — カリキュラム改善のためにコホート横断のデータ分析を行う。

### 体験の全体像

講義中、受講生はVS Code上でスレッドを立ててメモを取る。プリセットタグや自由タグで整理し、「これ試す」「この記事読む」といったTODOを残し、参考URLを貼る。課題のコードもVS Codeから直接提出する。

自宅では、Webアプリでスレッドを読み返して復習する。TODOを消化し、参考URLを読み、翌日の講義やコーディングに繋げる。

講師はWebダッシュボードで提出コードをレビューし、承認または要修正の判定を行う。インラインコメントで具体的な指摘を残す。同じダッシュボード上で、受講生全体の学習傾向を分析する。

### プロダクト構成

| コンポーネント | 用途 | ユーザー |
|---|---|---|
| VS Code拡張 | メモ・TODO・ブックマーク・コード提出 | 受講生 |
| Webアプリ | 復習・TODO消化・ブックマーク閲覧・コードレビュー・分析 | 受講生・講師・運営 |
| REST API | 全クライアント共通のバックエンド | — |

---

## 2. アーキテクチャ

```
┌─────────────────┐  ┌─────────────────┐
│  VS Code 拡張   │  │  Web アプリ     │
└────────┬────────┘  └────────┬────────┘
         │                    │
         └─────────┬──────────┘
                   │
           ┌───────▼───────┐  ┌───────────────┐
           │  REST API     │─▶│ Firebase Auth │
           │  Cloud Run    │  └───────────────┘
           └───────┬───────┘
                   │
           ┌───────▼───────┐
           │  Cloud SQL    │
           │  PostgreSQL   │
           └───────────────┘
```

### 技術選定と理由

**データストア: Cloud SQL（PostgreSQL）**

PostgreSQLを選んだ理由は3つある。第一に、分析との相性。SQLで直接クエリできるため、分析のたびにエクスポートパイプラインを組む必要がない。第二に、分析ビューの実装。VIEWでメモ本文やコード本体を除外したビューを作れるため、アプリ層にフィルタロジックを持つ必要がない。第三に、Google Cloudへの一貫性。Cloud SQLはGoogle Cloudネイティブであり、最終的なインフラ構成と一致する。

**API: Cloud Run**

全クライアントがREST APIを経由する構成とする。理由は設計判断3.1を参照。

**認証: Firebase Auth（初期）**

認証の立ち上げ速度を優先して初期はFirebase Authを採用する。ただしAPI層では`external_auth_id`として扱い、認証プロバイダに非依存な設計とする。将来Auth0やCloud Identity Platformへの差し替えが可能。

---

## 3. 設計判断ログ（機能横断）

機能固有の設計判断は各specに記載。ここにはプロダクト全体に影響する判断のみ置く。

### 3.1 API-first / Headless SaaS

**判断**: 全クライアントがREST API（Cloud Run）を経由する。データストアを直接叩かない。

**理由**: VS Code拡張は最初のクライアントにすぎない。受講生用Webアプリ、Notion/Slack連携、API外部公開が既に視野に入っている。最初からデータストアを直接叩く設計にすると、後からAPI層を挟むリファクタリングが全体に波及する。初期コストは多少増えるが、Headless化の選択肢を残すために必要な投資である。

**帰結**: 将来の拡張は全て「同じAPIを叩く新しいクライアントを作る」だけで実現できる。

### 3.2 ユーザーのロール管理

**判断**: `users.role`はシステムレベルの権限（admin判定）にのみ使用する。コホート内でのstudent / instructorの区別は`user_cohorts.role_in_cohort`で表現する。

**理由**: 同じ人がある期ではstudent、別の期ではinstructorになることがあり得る。コホートに属さないシステム管理者（admin）は`users.role`で判定し、`user_cohorts`には入らない。`users.role`の値は`admin`のみ意味を持ち、student / instructorの判定には使わない。

### 3.3 URLネスト深度は2階層まで

リソースのネストは2階層まで（例: `/threads/:id/messages`）とする。3階層以上はトップレベルに切り出す。たとえば`/reviews/:id/comments`であって`/submissions/:id/reviews/:id/comments`ではない。深いネストはURLが長くなるだけでなく、クライアント側で親リソースのIDを全て保持する必要があり実装コストが上がるため。

### 3.4 ページネーションはcursorベース

offsetベースではなくcursorベース（`created_at`または`position`を基準）を採用する。データの追加・削除が頻繁に起きる環境（メモの追記、TODO完了など）では、offsetだとページ間で重複や欠落が発生する。cursorベースならデータの増減に関係なく一貫した結果を返せる。

### 3.5 権限モデルは3層

受講生は自分のデータのみ参照・操作可能。講師は担当コホートのデータを参照可能で、レビュー関連は書き込みも可能。adminは全データ参照・操作可能。この3層は`user_cohorts.role_in_cohort`と`users.role`から判定する。

「担当コホート」は`user_cohorts`でinstructorとして紐づいているコホートを指す。講師が担当外のコホートのデータにアクセスすることはできない。

### 3.6 threadsとsubmissionsにworkspace_idを持たせる

**判断**: `threads`と`submissions`に`workspace_id`を持たせ、API層が自動設定する。`workspaces`テーブルがスレッドのコンテナとして機能し、コホートと1:1で紐づく（`cohorts.workspace_id`）。

**理由**: コホート別の分析集計には、各レコードがどのコホートに属するかを知る必要がある。`user_cohorts`テーブル経由で取得する方法だと、1人の受講生が複数コホートに属している場合に行が重複し、分析結果が不正確になる。`workspace_id`を持たせ、`workspaces` → `cohorts`のJOINでコホートを特定することで、正確なコホート別集計ができる。

**workspaceを挟む理由**: `cohort_id`を直接持たせると、スレッドは必ずコホートに属する設計になり、個人利用やチーム利用に対応できない。`workspaces`を間に挟むことで、コホートworkspace（研修用）とpersonal workspace（個人用）を同じ構造で扱える。コホート作成時にworkspaceが自動生成され、研修フローは透過的に動作する。

---

## 4. 共有スキーマとAPI共通仕様

機能横断で使われるテーブルとAPIの共通仕様。機能固有のスキーマ・APIは各specに記載。

### enum定義

```sql
CREATE TYPE user_role AS ENUM ('admin', 'member');
CREATE TYPE cohort_role AS ENUM ('student', 'instructor');
CREATE TYPE workspace_type AS ENUM ('personal', 'cohort');
CREATE TYPE tag_type AS ENUM ('preset', 'custom');
CREATE TYPE review_verdict AS ENUM ('approved', 'needs_revision');
```

### 共有テーブル

```sql
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type workspace_type NOT NULL,
    name TEXT NOT NULL,
    owner_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cohorts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'member',
    external_auth_id TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_cohorts (
    user_id UUID NOT NULL REFERENCES users(id),
    cohort_id UUID NOT NULL REFERENCES cohorts(id),
    role_in_cohort cohort_role NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, cohort_id)
);
```

### 全テーブル共通ルール

全テーブルに`created_at`と`updated_at`を持つ。ただし中間テーブル（`user_cohorts`, `thread_tags`）は追加と削除のみで更新が発生しないため、`created_at`のみ持つ。PKは`uuid`。中間テーブルは複合ユニーク制約を持つ。`updated_at`はアプリケーション側で更新時にセットする（DBトリガーでも可）。

### API共通仕様

**認証**: 全エンドポイントで必須。Firebase Authのトークンを`Authorization: Bearer`ヘッダーで渡す。

**レスポンス形式**: JSON。

**ページネーション**: cursorベース。レスポンスに`next_cursor`を含む。クライアントは`?cursor=xxx`で次ページを取得する。

**エラーレスポンス**: HTTPステータスコードに加え、`{ "error": { "code": "...", "message": "..." } }`形式のボディを返す。未処理の例外はグローバルエラーハンドラが`500 INTERNAL_ERROR`として統一フォーマットで返す。

**CORS**: 全オリジンを許可する（開発段階）。本番デプロイ時にVS Code拡張・Webアプリ・ダッシュボードのオリジンに制限する。

### 認証ミドルウェア・認証エンドポイント・コホートエンドポイント

`specs/auth.md`を参照。

---

## 5. データ分析の方針

教育ドメインでのポジションを確立するために、データ分析に力を入れる。受講生の学習行動データ（メモの量、TODO完了率、ブックマークのドメイン傾向、提出パターン、レビューリードタイム等）を蓄積し、コホート単位でカリキュラム改善のサイクルを回す。

分析ビューにはメモ本文と提出コード本体を含めず、`user_id`と行動メタデータを含める。ユーザー単位の行動相関もコホート比較も取れる。具体的な分析指標、ビュー定義、画面仕様は`specs/analytics.md`を参照。

---

## 6. 将来の拡張（今は作らない、設計で塞がない）

- **個人ワークスペース** — `workspaces`テーブルに`type = 'personal'`のレコードを作成し、`owner_id`でユーザーに紐づけるだけで実現できる。スレッド・TODO・ブックマークの仕組みはそのまま使える。
- **チームワークスペース** — `workspace_type` enumに`'team'`を追加し、メンバーシップ管理を加えるだけで実現できる。
- **Notion / Slack連携** — 同じAPIを叩くインテグレーションを書くだけで実現できる。
- **API外部公開（Headless SaaS）** — 認証レイヤーを追加するだけで実現できる。
- **Web版・モバイル版メモアプリ** — 同じAPIの上に乗せるだけで実現できる。
- **BigQuery移行** — 分析規模が大きくなった場合。PostgreSQLからのエクスポートで対応する。