import { Router, type Router as RouterType } from "express";
import { z } from "zod/v4";
import {
  verifyToken,
  resolveUser,
  requireAdmin,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";
import { sendValidationError } from "../middleware/validate.js";
import {
  listCohorts,
  createCohort,
  getCohortById,
  updateCohort,
  listMembers,
  addMember,
  removeMember,
  isInstructorOfCohort,
  MemberAlreadyExistsError,
} from "../services/cohorts.js";

import { param } from "./helpers.js";

const router: RouterType = Router();

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const createCohortSchema = z.object({
  name: z.string().trim().min(1).max(100),
  start_date: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
  end_date: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
});

const updateCohortSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  start_date: z.string().regex(dateRegex, "Must be YYYY-MM-DD").optional(),
  end_date: z.string().regex(dateRegex, "Must be YYYY-MM-DD").optional(),
});

const addMemberSchema = z.object({
  user_id: z.uuid(),
  role_in_cohort: z.enum(["student", "instructor"]),
});

// GET /cohorts
router.get("/", verifyToken, resolveUser, async (_req, res) => {
  const rows = await listCohorts();
  res.json({ cohorts: rows });
});

// POST /cohorts
router.post("/", verifyToken, resolveUser, requireAdmin, async (req, res) => {
  const parsed = createCohortSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  if (parsed.data.end_date <= parsed.data.start_date) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "end_date must be after start_date",
      },
    });
    return;
  }

  const cohort = await createCohort(parsed.data);
  res.status(201).json(cohort);
});

// GET /cohorts/:id
router.get("/:id", verifyToken, resolveUser, async (req, res) => {
  const cohort = await getCohortById(param(req, "id"));
  if (!cohort) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Cohort not found" },
    });
    return;
  }
  res.json(cohort);
});

// PATCH /cohorts/:id
router.patch("/:id", verifyToken, resolveUser, requireAdmin, async (req, res) => {
  const parsed = updateCohortSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const existing = await getCohortById(param(req, "id"));
  if (!existing) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Cohort not found" },
    });
    return;
  }

  // Validate date range with existing values as fallback
  const finalStartDate = parsed.data.start_date ?? existing.start_date;
  const finalEndDate = parsed.data.end_date ?? existing.end_date;
  if (finalEndDate <= finalStartDate) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "end_date must be after start_date",
      },
    });
    return;
  }

  const updated = await updateCohort(param(req, "id"), parsed.data);
  if (!updated) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Cohort not found" },
    });
    return;
  }

  // Re-fetch with member_count for response
  const result = await getCohortById(param(req, "id"));
  res.json(result);
});

// GET /cohorts/:id/members
router.get("/:id/members", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;

  const cohort = await getCohortById(param(req, "id"));
  if (!cohort) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Cohort not found" },
    });
    return;
  }

  // Check permission: admin or instructor of this cohort
  if (user.role !== "admin") {
    const isInstructor = await isInstructorOfCohort(user.id, param(req, "id"));
    if (!isInstructor) {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "Access denied" },
      });
      return;
    }
  }

  const members = await listMembers(param(req, "id"));
  res.json({ members });
});

// POST /cohorts/:id/members
router.post("/:id/members", verifyToken, resolveUser, requireAdmin, async (req, res) => {
  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const cohort = await getCohortById(param(req, "id"));
  if (!cohort) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Cohort not found" },
    });
    return;
  }

  let result;
  try {
    result = await addMember({
      cohort_id: param(req, "id"),
      user_id: parsed.data.user_id,
      role_in_cohort: parsed.data.role_in_cohort,
    });
  } catch (err) {
    if (err instanceof MemberAlreadyExistsError) {
      res.status(409).json({
        error: { code: "ALREADY_MEMBER", message: "Already a member" },
      });
      return;
    }
    throw err;
  }

  if ("error" in result) {
    res.status(404).json({
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    });
    return;
  }

  res.status(201).json(result.data);
});

// DELETE /cohorts/:id/members/:user_id
router.delete("/:id/members/:user_id", verifyToken, resolveUser, requireAdmin, async (req, res) => {
  const cohort = await getCohortById(param(req, "id"));
  if (!cohort) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Cohort not found" },
    });
    return;
  }

  const removed = await removeMember(param(req, "id"), param(req, "user_id"));
  if (!removed) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Membership not found" },
    });
    return;
  }

  res.status(204).send();
});

export default router;
