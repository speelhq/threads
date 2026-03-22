import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tagTypeEnum } from "./enums.js";
import { users, cohorts, workspaces } from "./auth.js";

export const threads = pgTable(
  "threads",
  {
    id: uuid().primaryKey().defaultRandom(),
    user_id: uuid()
      .notNull()
      .references(() => users.id),
    workspace_id: uuid()
      .notNull()
      .references(() => workspaces.id),
    title: text().notNull(),
    pinned_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_threads_user_id").on(t.user_id),
    index("idx_threads_workspace_id").on(t.workspace_id),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    thread_id: uuid()
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    body: text().notNull(),
    position: integer().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_messages_thread_id").on(t.thread_id)],
);

export const todos = pgTable(
  "todos",
  {
    id: uuid().primaryKey().defaultRandom(),
    thread_id: uuid()
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    content: text().notNull(),
    position: integer().notNull(),
    completed_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_todos_thread_id").on(t.thread_id),
    index("idx_todos_completed_at")
      .on(t.completed_at)
      .where(sql`completed_at IS NULL`),
  ],
);

export const bookmarks = pgTable(
  "bookmarks",
  {
    id: uuid().primaryKey().defaultRandom(),
    thread_id: uuid()
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    url: text().notNull(),
    title: text(),
    description: text(),
    domain: text().notNull(),
    position: integer().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_bookmarks_thread_id").on(t.thread_id)],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    type: tagTypeEnum().notNull(),
    cohort_id: uuid().references(() => cohorts.id),
    created_by: uuid()
      .notNull()
      .references(() => users.id),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_tags_cohort_id").on(t.cohort_id),
    index("idx_tags_created_by").on(t.created_by),
  ],
);

export const threadTags = pgTable(
  "thread_tags",
  {
    thread_id: uuid()
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    tag_id: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.thread_id, t.tag_id] })],
);
