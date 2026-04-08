import { z } from "zod/v4";

const KEYWORD_CATEGORIES = ["discriminatory", "illegal", "scam", "other"] as const;

export const createKeywordSchema = z.object({
  phrase: z.string().trim().min(2, "Phrase must be at least 2 characters").max(200),
  category: z.enum(KEYWORD_CATEGORIES),
  notes: z.string().max(500).optional(),
});

export const updateKeywordSchema = z
  .object({
    phrase: z.string().trim().min(2).max(200).optional(),
    category: z.enum(KEYWORD_CATEGORIES).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "At least one field must be provided for update");

export const listKeywordsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  category: z.enum(KEYWORD_CATEGORIES).optional(),
});

export type CreateKeywordInput = z.infer<typeof createKeywordSchema>;
export type UpdateKeywordInput = z.infer<typeof updateKeywordSchema>;
export type ListKeywordsQuery = z.infer<typeof listKeywordsQuerySchema>;
