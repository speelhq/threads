import { Router, type Router as RouterType } from "express";
import { z } from "zod/v4";
import {
  verifyToken,
  resolveUser,
  type TokenVerifiedRequest,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";
import { sendValidationError } from "../middleware/validate.js";
import {
  findUserByExternalId,
  createUser,
  getUserWithCohorts,
} from "../services/auth.js";

const router: RouterType = Router();

const signupSchema = z.object({
  display_name: z.string().min(1).max(100),
});

// POST /auth/signup
router.post("/signup", verifyToken, async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const { firebaseUid, firebaseEmail } = req as TokenVerifiedRequest;

  const existing = await findUserByExternalId(firebaseUid);
  if (existing) {
    res.status(409).json({
      error: { code: "USER_ALREADY_EXISTS", message: "User already exists" },
    });
    return;
  }

  const user = await createUser({
    email: firebaseEmail,
    display_name: parsed.data.display_name,
    external_auth_id: firebaseUid,
  });

  res.status(201).json(user);
});

// POST /auth/login
router.post("/login", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;
  const result = await getUserWithCohorts(user.id);
  res.json(result);
});

// GET /auth/me
router.get("/me", verifyToken, resolveUser, async (req, res) => {
  const { user } = req as AuthenticatedRequest;
  const result = await getUserWithCohorts(user.id);
  res.json(result);
});

export default router;
