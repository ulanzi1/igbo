import { z } from "zod/v4";
import { REJECTION_CATEGORIES } from "@/lib/portal-errors";

/**
 * Discriminated union — narrows correctly per `decision` value, so route
 * handlers can drop non-null assertions on `reason`/`category`/`feedbackComment`.
 */
export const adminReviewDecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("approved"),
  }),
  z.object({
    decision: z.literal("rejected"),
    reason: z.string().min(20, "Rejection reason is required (min 20 chars)"),
    category: z.enum(REJECTION_CATEGORIES),
  }),
  z.object({
    decision: z.literal("changes_requested"),
    feedbackComment: z.string().min(20, "Feedback comment is required (min 20 chars)"),
  }),
]);

export type AdminReviewDecisionInput = z.infer<typeof adminReviewDecisionSchema>;
