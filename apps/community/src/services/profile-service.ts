import "server-only";
import {
  updateProfileFields,
  updatePrivacySettings as updatePrivacySettingsQuery,
  getProfileWithSocialLinks,
} from "@igbo/db/queries/community-profiles";
import { upsertSocialLink, deleteSocialLink } from "@igbo/db/queries/community-social-links";
import { eventBus } from "@/services/event-bus";
import type { UpdateProfileData, PrivacySettings, SocialProvider } from "@/features/profiles/types";

/** Update a member's display profile fields. Does NOT touch onboarding timestamps. */
export async function updateProfile(userId: string, data: UpdateProfileData) {
  const profile = await updateProfileFields(userId, data);

  eventBus.emit("member.profile_updated", {
    userId,
    timestamp: new Date().toISOString(),
  });

  return profile;
}

/** Update a member's privacy settings (visibility + location toggle). */
export async function updatePrivacySettings(userId: string, settings: PrivacySettings) {
  const profile = await updatePrivacySettingsQuery(userId, settings);

  eventBus.emit("member.privacy_settings_updated", {
    userId,
    timestamp: new Date().toISOString(),
  });

  return profile;
}

/** Link a social account to a member's profile. Only the profile URL and display name are stored. */
export async function linkSocialAccount(
  userId: string,
  provider: SocialProvider,
  providerDisplayName: string,
  providerProfileUrl: string,
) {
  const link = await upsertSocialLink(userId, provider, {
    providerDisplayName,
    providerProfileUrl,
  });

  eventBus.emit("member.social_account_linked", {
    userId,
    provider,
    timestamp: new Date().toISOString(),
  });

  return link;
}

/** Unlink a social account from a member's profile. */
export async function unlinkSocialAccount(userId: string, provider: SocialProvider) {
  await deleteSocialLink(userId, provider);

  eventBus.emit("member.social_account_unlinked", {
    userId,
    provider,
    timestamp: new Date().toISOString(),
  });
}

/** Get a profile with its social links. */
export async function getProfileWithLinks(userId: string) {
  return getProfileWithSocialLinks(userId);
}
