import { z } from "zod/v4";

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const PRESENT = "Present" as const;

export const experienceEntrySchema = z.object({
  title: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  startDate: z.string().regex(YEAR_MONTH, "Use YYYY-MM format"),
  endDate: z.union([z.string().regex(YEAR_MONTH, "Use YYYY-MM format"), z.literal(PRESENT)]),
  description: z.string().max(2000).optional(),
});

export const educationEntrySchema = z.object({
  institution: z.string().min(1).max(200),
  degree: z.string().min(1).max(100),
  field: z.string().min(1).max(100),
  graduationYear: z
    .number()
    .int()
    .min(1950)
    .max(new Date().getFullYear() + 7),
});

export const seekerProfileSchema = z.object({
  headline: z.string().min(1, "Headline is required").max(200),
  summary: z.string().max(5000).optional(),
  skills: z.array(z.string().min(1).max(50)).max(30).default([]),
  experience: z.array(experienceEntrySchema).max(20).default([]),
  education: z.array(educationEntrySchema).max(10).default([]),
});

export type SeekerProfileInput = z.infer<typeof seekerProfileSchema>;
export type ExperienceEntry = z.infer<typeof experienceEntrySchema>;
export type EducationEntry = z.infer<typeof educationEntrySchema>;
