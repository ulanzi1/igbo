import { z } from "zod/v4";
import { jobSearchRequestSchema } from "./job-search";

export const portalAlertFrequencySchema = z.enum(["instant", "daily", "off"]);

export const createSavedSearchSchema = z.object({
  name: z.string().trim().max(100).optional(),
  searchParams: jobSearchRequestSchema,
  alertFrequency: portalAlertFrequencySchema,
});

export const updateSavedSearchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    alertFrequency: portalAlertFrequencySchema.optional(),
  })
  .refine(
    (data) => data.name !== undefined || data.alertFrequency !== undefined,
    "At least one field is required",
  );
