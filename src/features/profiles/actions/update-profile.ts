"use server";
import "server-only";
import { z } from "zod/v4";
import { auth } from "@/server/auth/config";
import { sanitizeHtml } from "@/lib/sanitize";
import * as profileService from "@/services/profile-service";

const updateProfileSchema = z.object({
  displayName: z.string().min(1, "Display name is required").max(255),
  bio: z.string().max(2000).nullable().optional(),
  photoUrl: z.string().max(2048).nullable().optional(),
  locationCity: z.string().max(255).nullable().optional(),
  locationState: z.string().max(255).nullable().optional(),
  locationCountry: z.string().max(255).nullable().optional(),
  locationLat: z.string().nullable().optional(),
  locationLng: z.string().nullable().optional(),
  interests: z.array(z.string().max(100)).max(50).optional(),
  culturalConnections: z.array(z.string().max(100)).max(50).optional(),
  languages: z.array(z.string().max(100)).max(20).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export interface UpdateProfileResult {
  success: boolean;
  error?: string;
}

export async function updateProfileAction(input: UpdateProfileInput): Promise<UpdateProfileResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  const sanitizedBio = data.bio ? sanitizeHtml(data.bio) : data.bio;

  try {
    await profileService.updateProfile(session.user.id, { ...data, bio: sanitizedBio });
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update profile" };
  }
}
