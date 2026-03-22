import { eq } from "drizzle-orm";
import { getDb } from "../db/connection.js";
import { users } from "../db/schema/index.js";
import { userCohorts, cohorts } from "../db/schema/auth.js";

export async function findUserByExternalId(externalAuthId: string) {
  const [user] = await getDb()
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

export class EmailAlreadyExistsError extends Error {
  constructor() {
    super("Email already exists");
    this.name = "EmailAlreadyExistsError";
  }
}

export async function createUser(params: {
  email: string;
  display_name: string;
  external_auth_id: string;
}) {
  try {
    const rows = await getDb()
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
  } catch (err: unknown) {
    // Drizzle wraps Postgres errors in DrizzleQueryError with the original as `cause`
    const pgErr =
      err instanceof Error && "cause" in err && err.cause ? err.cause : err;
    if (
      typeof pgErr === "object" &&
      pgErr !== null &&
      "code" in pgErr &&
      (pgErr as { code: string }).code === "23505" &&
      "constraint_name" in pgErr &&
      (pgErr as { constraint_name: string }).constraint_name === "users_email_unique"
    ) {
      throw new EmailAlreadyExistsError();
    }
    throw err;
  }
}

export async function getUserWithCohorts(userId: string) {
  const [user] = await getDb()
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

  const cohortRows = await getDb()
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
