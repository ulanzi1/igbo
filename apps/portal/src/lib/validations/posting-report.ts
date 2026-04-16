import { z } from "zod/v4";
import { REPORT_CATEGORIES } from "@/lib/portal-errors";

export const submitReportSchema = z.object({
  category: z.enum(REPORT_CATEGORIES),
  description: z
    .string()
    .min(20, "Description must be at least 20 characters")
    .max(2000, "Description must be at most 2000 characters")
    .transform((s) => s.trim()),
});

export type SubmitReportInput = z.infer<typeof submitReportSchema>;

export const RESOLVE_ACTIONS = ["request_changes", "reject", "escalate_to_flag"] as const;

export type ResolveAction = (typeof RESOLVE_ACTIONS)[number];

export const resolveReportsSchema = z.object({
  resolutionAction: z.enum(RESOLVE_ACTIONS),
  resolutionNote: z
    .string()
    .min(20, "Resolution note must be at least 20 characters")
    .max(2000, "Resolution note must be at most 2000 characters")
    .transform((s) => s.trim()),
});

export type ResolveReportsInput = z.infer<typeof resolveReportsSchema>;

export const dismissReportsSchema = z.object({
  resolutionNote: z
    .string()
    .min(20, "Resolution note must be at least 20 characters")
    .max(2000, "Resolution note must be at most 2000 characters")
    .transform((s) => s.trim()),
});

export type DismissReportsInput = z.infer<typeof dismissReportsSchema>;
