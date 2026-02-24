"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { updateProfileAction } from "@/features/profiles/actions/update-profile";
import { updatePrivacySettingsAction } from "@/features/profiles/actions/update-privacy-settings";
import type { UpdateProfileInput } from "@/features/profiles/actions/update-profile";
import type { UpdatePrivacyInput } from "@/features/profiles/actions/update-privacy-settings";
import type { SocialProvider } from "@/features/profiles/types";

export function useProfile(userId?: string) {
  return useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const url = userId ? `/api/v1/profiles/${userId}` : "/api/v1/profiles/me";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch profile");
      const json = (await res.json()) as { data: { profile: unknown; socialLinks: unknown[] } };
      return json.data;
    },
    enabled: !!userId,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => updateProfileAction(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useUpdatePrivacySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePrivacyInput) => updatePrivacySettingsAction(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useUnlinkSocialAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (provider: SocialProvider) => {
      const res = await fetch(`/api/v1/profiles/social-link/${provider.toLowerCase()}/unlink`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to unlink account");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}
