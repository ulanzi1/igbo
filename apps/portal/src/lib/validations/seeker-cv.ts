import { z } from "zod/v4";

export const cvLabelSchema = z
  .string()
  .min(1, "Label is required")
  .max(100, "Label must be 100 characters or fewer");

export const cvUpdateSchema = z
  .object({
    label: z.string().min(1).max(100).optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((data) => data.label !== undefined || data.isDefault !== undefined, {
    message: "At least one field (label or isDefault) must be provided",
  });

export type CvUpdateInput = z.infer<typeof cvUpdateSchema>;
