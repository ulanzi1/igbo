"use server";
import "server-only";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import { saveProfile } from "@/services/onboarding-service";
import { ApiError } from "@/lib/api-error";

const saveProfileSchema = z.object({
  displayName: z.string().min(1, "Display name is required").max(255),
  bio: z.string().max(2000).nullable().optional(),
  photoUrl: z.string().url().max(2048).nullable().optional(),
  locationCity: z.string().max(255).nullable().optional(),
  locationState: z.string().max(255).nullable().optional(),
  locationCountry: z.string().max(255).nullable().optional(),
  locationLat: z.string().nullable().optional(),
  locationLng: z.string().nullable().optional(),
  interests: z.array(z.string().max(100)).max(50).optional(),
  culturalConnections: z.array(z.string().max(100)).max(50).optional(),
  languages: z.array(z.string().max(100)).max(20).optional(),
});

export type SaveProfileInput = z.infer<typeof saveProfileSchema>;

export interface SaveProfileResult {
  success: boolean;
  error?: string;
}

export async function saveProfileAction(input: SaveProfileInput): Promise<SaveProfileResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = saveProfileSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message ?? "Invalid input" };
  }

  try {
    await saveProfile(session.user.id, parsed.data);
    return { success: true };
  } catch (err) {
    const message = err instanceof ApiError ? err.detail : "Failed to save profile";
    return { success: false, error: message ?? "Failed to save profile" };
  }
}
