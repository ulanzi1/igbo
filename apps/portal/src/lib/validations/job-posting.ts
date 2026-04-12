import { z } from "zod/v4";

// Inline enum values to avoid importing from @igbo/db/schema (has "server-only")
// which breaks client component imports. Must stay in sync with DB schema enums.
const JOB_STATUS_VALUES = [
  "draft",
  "pending_review",
  "active",
  "paused",
  "filled",
  "expired",
  "rejected",
] as const;

const CLOSED_OUTCOME_VALUES = ["filled_via_portal", "filled_internally", "cancelled"] as const;

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
    expiresAt: z.string().datetime().optional().nullable(),
    descriptionIgboHtml: z.string().max(50000).optional().nullable().or(z.literal("")),
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

// Schema for editing a posting — extends jobPostingSchema with optimistic locking
// adminFeedbackComment is intentionally excluded (not in jobPostingSchema)
export const editJobPostingSchema = jobPostingSchema.extend({
  expectedUpdatedAt: z.string().datetime().optional(),
});

export type EditJobPostingInput = z.infer<typeof editJobPostingSchema>;

// Schema for status transitions
export const statusTransitionSchema = z.object({
  targetStatus: z.enum(JOB_STATUS_VALUES),
  closedOutcome: z.enum(CLOSED_OUTCOME_VALUES).optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
  newExpiresAt: z.string().datetime().optional(), // for renew (expired → active)
  contentChanged: z.boolean().optional(), // for renew: true = goes to pending_review
});

export type StatusTransitionInput = z.infer<typeof statusTransitionSchema>;
