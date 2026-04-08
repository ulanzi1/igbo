import { z } from "zod/v4";

const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
const CURRENCIES = ["NGN", "USD", "EUR", "GBP"] as const;

export const seekerPreferencesSchema = z
  .object({
    desiredRoles: z.array(z.string().min(1).max(100)).max(20, "errors.tooManyRoles").default([]),
    salaryMin: z.number().int().min(0).nullable().optional(),
    salaryMax: z.number().int().min(0).nullable().optional(),
    salaryCurrency: z.enum(CURRENCIES).default("NGN"),
    locations: z.array(z.string().min(1).max(100)).max(20, "errors.tooManyLocations").default([]),
    workModes: z
      .array(z.enum(WORK_MODES))
      .max(3)
      .refine((arr) => new Set(arr).size === arr.length, "No duplicate work modes allowed")
      .default([]),
  })
  .refine(
    (data) => {
      if (data.salaryMin != null && data.salaryMax != null) {
        return data.salaryMin <= data.salaryMax;
      }
      return true;
    },
    { message: "errors.salaryRangeInvalid", path: ["salaryMin"] },
  );

export type SeekerPreferencesInput = z.infer<typeof seekerPreferencesSchema>;
