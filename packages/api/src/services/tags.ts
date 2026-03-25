import { eq, and, or, asc, desc, sql, isNull } from "drizzle-orm";
import { getDb } from "../db/connection.js";
import { threads, tags, threadTags } from "../db/schema/threads.js";
import { cohorts } from "../db/schema/auth.js";
import { isInstructorOfCohort } from "./cohorts.js";

/**
 * List available tags: preset tags for the cohort (+ global presets) + user's custom tags.
 */
export async function listTags(params: { cohort_id: string; user_id: string }) {
  return getDb()
    .select({
      id: tags.id,
      name: tags.name,
      type: tags.type,
      cohort_id: tags.cohort_id,
      created_at: tags.created_at,
    })
    .from(tags)
    .where(
      or(
        and(
          eq(tags.type, "preset"),
          or(eq(tags.cohort_id, params.cohort_id), isNull(tags.cohort_id)),
        ),
        and(eq(tags.type, "custom"), eq(tags.created_by, params.user_id)),
      ),
    )
    .orderBy(asc(tags.type), asc(tags.name));
}

/**
 * Create a custom tag.
 */
export async function createCustomTag(params: { name: string; user_id: string }) {
  // Check for duplicate name for same user
  const [existing] = await getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(
      and(
        eq(tags.type, "custom"),
        eq(tags.created_by, params.user_id),
        eq(tags.name, params.name),
      ),
    )
    .limit(1);

  if (existing) throw new TagAlreadyExistsError();

  const [tag] = await getDb()
    .insert(tags)
    .values({
      name: params.name,
      type: "custom",
      created_by: params.user_id,
    })
    .returning({
      id: tags.id,
      name: tags.name,
      type: tags.type,
      cohort_id: tags.cohort_id,
      created_at: tags.created_at,
    });

  return tag;
}

/**
 * Create a preset tag. Requires instructor/admin permission.
 */
export async function createPresetTag(params: {
  name: string;
  cohort_id: string | null;
  user_id: string;
  user_role: string;
}) {
  // Verify cohort exists if specified
  if (params.cohort_id) {
    const [cohort] = await getDb()
      .select({ id: cohorts.id })
      .from(cohorts)
      .where(eq(cohorts.id, params.cohort_id))
      .limit(1);

    if (!cohort) throw new CohortNotFoundError();

    // Check permission: admin or instructor of this cohort
    if (params.user_role !== "admin") {
      const isInstructor = await isInstructorOfCohort(params.user_id, params.cohort_id);
      if (!isInstructor) throw new ForbiddenError();
    }
  } else {
    // Global preset: admin only
    if (params.user_role !== "admin") throw new ForbiddenError();
  }

  // Check for duplicate name in same scope
  const duplicateConditions = [
    eq(tags.type, "preset"),
    eq(tags.name, params.name),
  ];
  if (params.cohort_id) {
    duplicateConditions.push(eq(tags.cohort_id, params.cohort_id));
  } else {
    duplicateConditions.push(isNull(tags.cohort_id));
  }

  const [existing] = await getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(and(...duplicateConditions))
    .limit(1);

  if (existing) throw new TagAlreadyExistsError();

  const [tag] = await getDb()
    .insert(tags)
    .values({
      name: params.name,
      type: "preset",
      cohort_id: params.cohort_id,
      created_by: params.user_id,
    })
    .returning({
      id: tags.id,
      name: tags.name,
      type: tags.type,
      cohort_id: tags.cohort_id,
      created_at: tags.created_at,
    });

  return tag;
}

/**
 * Get a tag by ID.
 */
export async function getTagById(tagId: string) {
  const [row] = await getDb()
    .select({
      id: tags.id,
      name: tags.name,
      type: tags.type,
      cohort_id: tags.cohort_id,
      created_by: tags.created_by,
      created_at: tags.created_at,
    })
    .from(tags)
    .where(eq(tags.id, tagId))
    .limit(1);
  return row ?? null;
}

/**
 * Update a tag's name. Only by creator.
 */
export async function updateTag(tagId: string, params: { name: string }) {
  const tag = await getTagById(tagId);
  if (!tag) return null;

  // Check for duplicate name in same scope
  const duplicateConditions = [
    eq(tags.type, tag.type),
    eq(tags.name, params.name),
    sql`${tags.id} != ${tagId}`,
  ];

  if (tag.type === "custom") {
    duplicateConditions.push(eq(tags.created_by, tag.created_by));
  } else {
    if (tag.cohort_id) {
      duplicateConditions.push(eq(tags.cohort_id, tag.cohort_id));
    } else {
      duplicateConditions.push(isNull(tags.cohort_id));
    }
  }

  const [existing] = await getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(and(...duplicateConditions))
    .limit(1);

  if (existing) throw new TagAlreadyExistsError();

  const [updated] = await getDb()
    .update(tags)
    .set({ name: params.name, updated_at: new Date() })
    .where(eq(tags.id, tagId))
    .returning({
      id: tags.id,
      name: tags.name,
      type: tags.type,
      cohort_id: tags.cohort_id,
      created_at: tags.created_at,
    });

  return updated ?? null;
}

/**
 * Delete a tag. thread_tags cascade.
 */
export async function deleteTag(tagId: string): Promise<boolean> {
  const deleted = await getDb()
    .delete(tags)
    .where(eq(tags.id, tagId))
    .returning({ id: tags.id });
  return deleted.length > 0;
}

/**
 * Add a tag to a thread.
 */
export async function addTagToThread(params: {
  thread_id: string;
  tag_id: string;
  user_id: string;
}) {
  // Verify tag exists and is accessible
  const tag = await getTagById(params.tag_id);
  if (!tag) throw new InvalidTagError();
  if (tag.type === "custom" && tag.created_by !== params.user_id) {
    throw new InvalidTagError();
  }

  // Check if already tagged
  const [existing] = await getDb()
    .select({ thread_id: threadTags.thread_id })
    .from(threadTags)
    .where(
      and(
        eq(threadTags.thread_id, params.thread_id),
        eq(threadTags.tag_id, params.tag_id),
      ),
    )
    .limit(1);

  if (existing) throw new AlreadyTaggedError();

  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .insert(threadTags)
      .values({
        thread_id: params.thread_id,
        tag_id: params.tag_id,
      })
      .returning({
        thread_id: threadTags.thread_id,
        tag_id: threadTags.tag_id,
        created_at: threadTags.created_at,
      });

    await tx
      .update(threads)
      .set({ updated_at: new Date() })
      .where(eq(threads.id, params.thread_id));

    return row;
  });
}

/**
 * Remove a tag from a thread.
 */
export async function removeTagFromThread(threadId: string, tagId: string): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const deleted = await tx
      .delete(threadTags)
      .where(
        and(
          eq(threadTags.thread_id, threadId),
          eq(threadTags.tag_id, tagId),
        ),
      )
      .returning({ thread_id: threadTags.thread_id });

    if (deleted.length === 0) return false;

    await tx
      .update(threads)
      .set({ updated_at: new Date() })
      .where(eq(threads.id, threadId));

    return true;
  });
}

export class TagAlreadyExistsError extends Error {
  constructor() {
    super("Tag already exists");
    this.name = "TagAlreadyExistsError";
  }
}

export class InvalidTagError extends Error {
  constructor() {
    super("Invalid or inaccessible tag");
    this.name = "InvalidTagError";
  }
}

export class AlreadyTaggedError extends Error {
  constructor() {
    super("Already tagged");
    this.name = "AlreadyTaggedError";
  }
}

export class CohortNotFoundError extends Error {
  constructor() {
    super("Cohort not found");
    this.name = "CohortNotFoundError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}
