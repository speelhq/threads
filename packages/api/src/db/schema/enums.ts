import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "member"]);
export const cohortRoleEnum = pgEnum("cohort_role", ["student", "instructor"]);
export const workspaceTypeEnum = pgEnum("workspace_type", ["personal", "cohort"]);
export const tagTypeEnum = pgEnum("tag_type", ["preset", "custom"]);
export const reviewVerdictEnum = pgEnum("review_verdict", [
  "approved",
  "needs_revision",
]);
