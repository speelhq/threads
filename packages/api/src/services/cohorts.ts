import { eq, desc, asc, sql, and } from "drizzle-orm";
import { getDb } from "../db/connection.js";
import { cohorts, users, userCohorts } from "../db/schema/auth.js";

export async function listCohorts() {
  const rows = await getDb()
    .select({
      id: cohorts.id,
      name: cohorts.name,
      start_date: cohorts.start_date,
      end_date: cohorts.end_date,
      member_count:
        sql<number>`(SELECT COUNT(*) FROM user_cohorts WHERE cohort_id = ${cohorts.id})`.as(
          "member_count",
        ),
      created_at: cohorts.created_at,
    })
    .from(cohorts)
    .orderBy(desc(cohorts.start_date));
  return rows;
}

export async function createCohort(params: {
  name: string;
  start_date: string;
  end_date: string;
}) {
  const [row] = await getDb()
    .insert(cohorts)
    .values(params)
    .returning({
      id: cohorts.id,
      name: cohorts.name,
      start_date: cohorts.start_date,
      end_date: cohorts.end_date,
      created_at: cohorts.created_at,
    });
  return row;
}

export async function getCohortById(cohortId: string) {
  const [row] = await getDb()
    .select({
      id: cohorts.id,
      name: cohorts.name,
      start_date: cohorts.start_date,
      end_date: cohorts.end_date,
      member_count:
        sql<number>`(SELECT COUNT(*) FROM user_cohorts WHERE cohort_id = ${cohorts.id})`.as(
          "member_count",
        ),
      created_at: cohorts.created_at,
      updated_at: cohorts.updated_at,
    })
    .from(cohorts)
    .where(eq(cohorts.id, cohortId))
    .limit(1);
  return row ?? null;
}

export async function updateCohort(
  cohortId: string,
  params: { name?: string; start_date?: string; end_date?: string },
) {
  const [row] = await getDb()
    .update(cohorts)
    .set({ ...params, updated_at: new Date() })
    .where(eq(cohorts.id, cohortId))
    .returning({
      id: cohorts.id,
      name: cohorts.name,
      start_date: cohorts.start_date,
      end_date: cohorts.end_date,
      created_at: cohorts.created_at,
      updated_at: cohorts.updated_at,
    });
  return row ?? null;
}

export async function listMembers(cohortId: string) {
  const rows = await getDb()
    .select({
      user_id: users.id,
      email: users.email,
      display_name: users.display_name,
      role_in_cohort: userCohorts.role_in_cohort,
      created_at: userCohorts.created_at,
    })
    .from(userCohorts)
    .innerJoin(users, eq(userCohorts.user_id, users.id))
    .where(eq(userCohorts.cohort_id, cohortId))
    .orderBy(asc(users.display_name));
  return rows;
}

export async function isInstructorOfCohort(
  userId: string,
  cohortId: string,
): Promise<boolean> {
  const [row] = await getDb()
    .select({ user_id: userCohorts.user_id })
    .from(userCohorts)
    .where(
      and(
        eq(userCohorts.user_id, userId),
        eq(userCohorts.cohort_id, cohortId),
        eq(userCohorts.role_in_cohort, "instructor"),
      ),
    )
    .limit(1);
  return !!row;
}

export class MemberAlreadyExistsError extends Error {
  constructor() {
    super("Member already exists");
    this.name = "MemberAlreadyExistsError";
  }
}

export async function addMember(params: {
  cohort_id: string;
  user_id: string;
  role_in_cohort: "student" | "instructor";
}) {
  // Verify user exists
  const [user] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, params.user_id))
    .limit(1);
  if (!user) return { error: "USER_NOT_FOUND" as const };

  try {
    const [row] = await getDb()
      .insert(userCohorts)
      .values({
        user_id: params.user_id,
        cohort_id: params.cohort_id,
        role_in_cohort: params.role_in_cohort,
      })
      .returning({
        user_id: userCohorts.user_id,
        cohort_id: userCohorts.cohort_id,
        role_in_cohort: userCohorts.role_in_cohort,
        created_at: userCohorts.created_at,
      });
    return { data: row };
  } catch (err: unknown) {
    const pgErr =
      err instanceof Error && "cause" in err && err.cause ? err.cause : err;
    if (
      typeof pgErr === "object" &&
      pgErr !== null &&
      "code" in pgErr &&
      (pgErr as { code: string }).code === "23505"
    ) {
      throw new MemberAlreadyExistsError();
    }
    throw err;
  }
}

export async function removeMember(cohortId: string, userId: string) {
  const deleted = await getDb()
    .delete(userCohorts)
    .where(
      and(
        eq(userCohorts.cohort_id, cohortId),
        eq(userCohorts.user_id, userId),
      ),
    )
    .returning({ user_id: userCohorts.user_id });
  return deleted.length > 0;
}
