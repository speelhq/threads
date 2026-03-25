import type { Request, Response, NextFunction } from "express";
import { auth } from "./firebase.js";
import { findUserByExternalId } from "../services/auth.js";

export type AuthUser = {
  id: string;
  email: string;
  display_name: string;
  role: "admin" | "member";
};

/** Request after verifyToken has run. */
export type TokenVerifiedRequest = Request & {
  firebaseUid: string;
  firebaseEmail: string;
  firebaseName?: string;
};

/** Request after verifyToken + resolveUser have run. */
export type AuthenticatedRequest = TokenVerifiedRequest & {
  user: AuthUser;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      firebaseUid?: string;
      firebaseEmail?: string;
      firebaseName?: string;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice(7);
}

/**
 * Verifies Firebase token and sets req.firebaseUid / req.firebaseEmail.
 */
export async function verifyToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid authorization header",
      },
    });
    return;
  }

  let decoded;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch {
    res.status(401).json({
      error: {
        code: "TOKEN_EXPIRED",
        message: "Token is expired or invalid",
      },
    });
    return;
  }

  if (!decoded.email) {
    res.status(400).json({
      error: {
        code: "EMAIL_REQUIRED",
        message: "Token does not contain an email address",
      },
    });
    return;
  }

  req.firebaseUid = decoded.uid;
  req.firebaseEmail = decoded.email;
  req.firebaseName = decoded.name;
  next();
}

/**
 * Looks up the user in the DB by req.firebaseUid and sets req.user.
 * Must be used after verifyToken.
 */
export async function resolveUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.firebaseUid) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid authorization header",
      },
    });
    return;
  }

  const user = await findUserByExternalId(req.firebaseUid);

  if (!user) {
    res.status(401).json({
      error: {
        code: "USER_NOT_FOUND",
        message: "User not found",
      },
    });
    return;
  }

  req.user = user;
  next();
}

/**
 * Requires the authenticated user to have admin role.
 * Must be used after resolveUser.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: "Admin access required",
      },
    });
    return;
  }
  next();
}
