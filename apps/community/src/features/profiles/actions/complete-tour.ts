"use server";
import "server-only";
import { auth } from "@/server/auth/config";
import { completeTour } from "@/services/onboarding-service";

export interface CompleteTourResult {
  success: boolean;
  error?: string;
}

export async function completeTourAction(options: {
  skipped: boolean;
}): Promise<CompleteTourResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await completeTour(session.user.id, options);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to save tour status" };
  }
}
