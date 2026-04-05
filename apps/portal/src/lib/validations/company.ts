import { z } from "zod/v4";

export const INDUSTRY_OPTIONS = [
  "technology",
  "finance",
  "healthcare",
  "education",
  "manufacturing",
  "retail",
  "agriculture",
  "energy",
  "media",
  "consulting",
  "legal",
  "real_estate",
  "non_profit",
  "government",
  "other",
] as const;

export const COMPANY_SIZE_OPTIONS = ["1-10", "11-50", "51-200", "201-500", "500+"] as const;

export const companyProfileSchema = z.object({
  name: z.string().min(1, "Company name is required").max(200),
  logoUrl: z.string().url().optional().or(z.literal("")),
  description: z.string().max(5000).optional(),
  industry: z.enum(INDUSTRY_OPTIONS).optional(),
  companySize: z.enum(COMPANY_SIZE_OPTIONS).optional(),
  cultureInfo: z.string().max(5000).optional(),
});

export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;
