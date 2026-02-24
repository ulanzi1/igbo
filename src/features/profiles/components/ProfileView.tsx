"use client";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { CommunityProfile, CommunitySocialLink } from "@/db/schema/community-profiles";

interface Props {
  profile: CommunityProfile;
  socialLinks: CommunitySocialLink[];
}

const SOCIAL_ICONS: Record<string, string> = {
  FACEBOOK: "f",
  LINKEDIN: "in",
  TWITTER: "𝕏",
  INSTAGRAM: "ig",
};

export function ProfileView({ profile, socialLinks }: Props) {
  const t = useTranslations("Profile");
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "en";

  return (
    <div className="space-y-6">
      {/* Avatar + name */}
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-indigo-100">
          {profile.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.photoUrl}
              alt={profile.displayName}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-3xl text-indigo-400">👤</span>
          )}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{profile.displayName}</h1>
          {/* Verification badge area — Story 1.10 will add actual badges */}
          <div aria-label={t("verificationBadge")} />
        </div>
      </div>

      {/* Bio */}
      {profile.bio && <p className="text-sm text-gray-700">{profile.bio}</p>}

      {/* Location — only render if location fields are present; do not expose locationVisible boolean */}
      {(profile.locationCity ?? profile.locationState ?? profile.locationCountry) ? (
        <p className="text-sm text-gray-500">
          {[profile.locationCity, profile.locationState, profile.locationCountry]
            .filter(Boolean)
            .join(", ")}
        </p>
      ) : null}

      {/* Interests */}
      {profile.interests.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t("interests")}
          </p>
          <div className="flex flex-wrap gap-1">
            {profile.interests.map((tag) => (
              <span
                key={tag}
                className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Cultural connections */}
      {profile.culturalConnections.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t("culturalConnections")}
          </p>
          <div className="flex flex-wrap gap-1">
            {profile.culturalConnections.map((tag) => (
              <span
                key={tag}
                className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Languages */}
      {profile.languages.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t("languages")}
          </p>
          <div className="flex flex-wrap gap-1">
            {profile.languages.map((lang) => (
              <span
                key={lang}
                className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
              >
                {lang}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Social links */}
      {socialLinks.length > 0 ? (
        <div className="flex gap-3">
          {socialLinks.map((link) => (
            <a
              key={link.provider}
              href={link.providerProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={link.providerDisplayName}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600 hover:bg-gray-200"
            >
              {SOCIAL_ICONS[link.provider] ?? link.provider[0]}
            </a>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400">{t("noSocialLinks")}</p>
      )}

      {/* Message button — stub until Epic 2 (chat) ships */}
      <a
        href={`/${locale}/chat`}
        aria-label={t("messageButton")}
        className="inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        {t("messageButton")}
      </a>
    </div>
  );
}
