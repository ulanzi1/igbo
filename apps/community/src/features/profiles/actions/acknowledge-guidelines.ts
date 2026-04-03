"use server";
import "server-only";
import { auth } from "@igbo/auth";
import { acknowledgeGuidelines } from "@/services/onboarding-service";

export interface AcknowledgeGuidelinesResult {
  success: boolean;
  error?: string;
}

export async function acknowledgeGuidelinesAction(): Promise<AcknowledgeGuidelinesResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await acknowledgeGuidelines(session.user.id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to record acknowledgment" };
  }
}
