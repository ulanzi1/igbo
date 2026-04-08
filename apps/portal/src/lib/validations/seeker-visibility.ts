import { z } from "zod/v4";

const VISIBILITY_VALUES = ["active", "passive", "hidden"] as const;

export const seekerVisibilitySchema = z.object({
  visibility: z.enum(VISIBILITY_VALUES),
});

export const seekerConsentSchema = z
  .object({
    consentMatching: z.boolean().optional(),
    consentEmployerView: z.boolean().optional(),
  })
  .refine((data) => data.consentMatching !== undefined || data.consentEmployerView !== undefined, {
    message: "At least one consent field must be provided",
  });

export type SeekerVisibilityInput = z.infer<typeof seekerVisibilitySchema>;
export type SeekerConsentInput = z.infer<typeof seekerConsentSchema>;
