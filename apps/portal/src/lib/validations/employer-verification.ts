import { z } from "zod/v4";

export const submitVerificationSchema = z.object({
  documents: z
    .array(
      z.object({
        fileUploadId: z.string().uuid(),
        objectKey: z.string().min(1),
        originalFilename: z.string().min(1),
      }),
    )
    .min(1, "At least one document is required")
    .max(3, "Maximum 3 documents allowed"),
});

export const rejectVerificationSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(20, "Rejection reason must be at least 20 characters")
    .max(2000, "Rejection reason must be at most 2000 characters"),
});
