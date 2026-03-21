import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "../db/schema/index.js";
import { userCohorts, cohorts } from "../db/schema/auth.js";

export async function findUserByExternalId(externalAuthId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      display_name: users.display_name,
      role: users.role,
    })
    .from(users)
    .where(eq(users.external_auth_id, externalAuthId))
    .limit(1);
  return user ?? null;
}

export async function createUser(params: {
  email: string;
  display_name: string;
  external_auth_id: string;
}) {
  const rows = await db
    .insert(users)
    .values(params)
    .onConflictDoNothing({ target: users.external_auth_id })
    .returning({
      id: users.id,
      email: users.email,
      display_name: users.display_name,
      role: users.role,
      created_at: users.created_at,
    });
  return rows[0] ?? null;
}

export async function getUserWithCohorts(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      display_name: users.display_name,
      role: users.role,
      created_at: users.created_at,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  const cohortRows = await db
    .select({
      cohort_id: userCohorts.cohort_id,
      name: cohorts.name,
      role_in_cohort: userCohorts.role_in_cohort,
      start_date: cohorts.start_date,
      end_date: cohorts.end_date,
    })
    .from(userCohorts)
    .innerJoin(cohorts, eq(userCohorts.cohort_id, cohorts.id))
    .where(eq(userCohorts.user_id, userId));

  return { ...user, cohorts: cohortRows };
}
