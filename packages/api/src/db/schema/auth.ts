import { pgTable, uuid, text, date, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { userRoleEnum, cohortRoleEnum, workspaceTypeEnum } from "./enums.js";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  display_name: text().notNull(),
  role: userRoleEnum().notNull().default("member"),
  external_auth_id: text().notNull().unique(),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid().primaryKey().defaultRandom(),
  type: workspaceTypeEnum().notNull(),
  name: text().notNull(),
  owner_id: uuid().references(() => users.id),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const cohorts = pgTable("cohorts", {
  id: uuid().primaryKey().defaultRandom(),
  workspace_id: uuid()
    .notNull()
    .references(() => workspaces.id),
  name: text().notNull(),
  start_date: date().notNull(),
  end_date: date().notNull(),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const userCohorts = pgTable(
  "user_cohorts",
  {
    user_id: uuid()
      .notNull()
      .references(() => users.id),
    cohort_id: uuid()
      .notNull()
      .references(() => cohorts.id),
    role_in_cohort: cohortRoleEnum().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.cohort_id] })],
);
