"use client";

import { useQuery } from "@tanstack/react-query";
import type { OnboardingState } from "@/services/onboarding-service";

async function fetchOnboardingState(): Promise<OnboardingState> {
  const res = await fetch("/api/v1/onboarding", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load onboarding state");
  const json = (await res.json()) as { data: OnboardingState };
  return json.data;
}

export function useOnboardingState() {
  return useQuery<OnboardingState>({
    queryKey: ["onboarding-state"],
    queryFn: fetchOnboardingState,
  });
}
