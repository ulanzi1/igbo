import { z } from "zod/v4";
import { VIOLATION_CATEGORIES } from "@/lib/portal-errors";

export const createFlagSchema = z.object({
  category: z.enum(VIOLATION_CATEGORIES),
  severity: z.enum(["low", "medium", "high"]),
  description: z
    .string()
    .min(20, "Description must be at least 20 characters")
    .max(2000, "Description must be at most 2000 characters")
    .transform((s) => s.trim()),
});

export type CreateFlagInput = z.infer<typeof createFlagSchema>;

export const resolveFlagSchema = z.object({
  action: z.enum(["request_changes", "reject"]),
  note: z
    .string()
    .min(20, "Resolution note must be at least 20 characters")
    .max(2000, "Resolution note must be at most 2000 characters")
    .transform((s) => s.trim()),
});

export type ResolveFlagInput = z.infer<typeof resolveFlagSchema>;

export const dismissFlagSchema = z.object({
  note: z
    .string()
    .min(20, "Resolution note must be at least 20 characters")
    .max(2000, "Resolution note must be at most 2000 characters")
    .transform((s) => s.trim()),
});

export type DismissFlagInput = z.infer<typeof dismissFlagSchema>;
