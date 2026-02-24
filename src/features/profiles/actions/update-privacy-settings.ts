"use server";
import "server-only";
import { z } from "zod/v4";
import { auth } from "@/server/auth/config";
import * as profileService from "@/services/profile-service";

const updatePrivacySchema = z.object({
  profileVisibility: z.enum(["PUBLIC_TO_MEMBERS", "LIMITED", "PRIVATE"]).optional(),
  locationVisible: z.boolean().optional(),
});

export type UpdatePrivacyInput = z.infer<typeof updatePrivacySchema>;

export interface UpdatePrivacyResult {
  success: boolean;
  error?: string;
}

export async function updatePrivacySettingsAction(
  input: UpdatePrivacyInput,
): Promise<UpdatePrivacyResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = updatePrivacySchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message ?? "Invalid input" };
  }

  try {
    await profileService.updatePrivacySettings(session.user.id, parsed.data);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update privacy settings" };
  }
}
