"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
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

export function useMyProfilePhoto() {
  return useQuery({
    queryKey: ["profile", "me", "photo"],
    queryFn: async () => {
      const res = await fetch("/api/v1/profiles/me");
      if (!res.ok) return null;
      const json = (await res.json()) as {
        data: { profile: { photoUrl?: string | null } };
      };
      return json.data.profile.photoUrl ?? null;
    },
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { update } = useSession();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => updateProfileAction(input),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      // Refresh session so TopNav avatar reflects the new photo immediately
      void update({ picture: input.photoUrl ?? null });
      // Also refresh the TopNav photo query directly
      void queryClient.invalidateQueries({ queryKey: ["profile", "me", "photo"] });
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
