import { z } from "zod/v4";

export const EMPLOYMENT_TYPE_OPTIONS = [
  "full_time",
  "part_time",
  "contract",
  "internship",
] as const;

export const culturalContextSchema = z.object({
  diasporaFriendly: z.boolean().default(false),
  igboLanguagePreferred: z.boolean().default(false),
  communityReferred: z.boolean().default(false),
});
export type CulturalContext = z.infer<typeof culturalContextSchema>;

export const jobPostingSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(200),
    descriptionHtml: z.string().max(50000).optional().or(z.literal("")),
    requirements: z.string().max(50000).optional().or(z.literal("")),
    salaryMin: z.number().int().nonnegative().optional().nullable(),
    salaryMax: z.number().int().nonnegative().optional().nullable(),
    salaryCompetitiveOnly: z.boolean().default(false),
    location: z.string().max(200).optional().or(z.literal("")),
    employmentType: z.enum(EMPLOYMENT_TYPE_OPTIONS),
    applicationDeadline: z.string().datetime().optional().nullable(),
    descriptionIgboHtml: z.string().max(50000).optional().or(z.literal("")),
    culturalContextJson: culturalContextSchema.optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.salaryMin != null && data.salaryMax != null) {
        return data.salaryMin <= data.salaryMax;
      }
      return true;
    },
    { message: "Minimum salary must be less than or equal to maximum salary", path: ["salaryMin"] },
  );

export type JobPostingInput = z.infer<typeof jobPostingSchema>;
