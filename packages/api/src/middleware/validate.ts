import type { Response } from "express";
import { z } from "zod/v4";

export function sendValidationError(res: Response, error: z.ZodError): void {
  res.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: z.prettifyError(error),
    },
  });
}
