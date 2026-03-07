"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import type { CommunityProfile, CommunitySocialLink } from "@/db/schema/community-profiles";
import { createOrFindDirectConversation } from "@/features/chat/actions/create-conversation";
import { FollowButton } from "./FollowButton";
import { FollowList } from "./FollowList";
import { VerificationBadge } from "@/components/shared/VerificationBadge";

interface Props {
  profile: CommunityProfile;
  socialLinks: CommunitySocialLink[];
  viewerUserId: string; // viewer's own userId for self-detection
  badgeType?: "blue" | "red" | "purple" | null;
}

const SOCIAL_ICONS: Record<string, string> = {
  FACEBOOK: "f",
  LINKEDIN: "in",
  TWITTER: "𝕏",
  INSTAGRAM: "ig",
};

function MessageButton({ profileUserId }: { profileUserId: string }) {
  const t = useTranslations("Profile");
  const { data: session } = useSession();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Don't show message button for own profile
  if (!session?.user?.id || session.user.id === profileUserId) return null;

  function handleMessage() {
    startTransition(async () => {
      const result = await createOrFindDirectConversation(profileUserId);
      if ("conversationId" in result) {
        router.push(`/chat/${result.conversationId}`);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleMessage}
      disabled={isPending}
      aria-label={t("messageButton")}
      className="inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
    >
      {isPending ? "..." : t("messageButton")}
    </button>
  );
}

export function ProfileView({ profile, socialLinks, viewerUserId, badgeType }: Props) {
  const t = useTranslations("Profile");
  const params = useParams<{ locale: string }>();
  // locale used for social link display; kept for potential future use
  void params;

  const isOwnProfile = viewerUserId === profile.userId;
  const [activeTab, setActiveTab] = useState<"about" | "followers" | "following">("about");

  return (
    <div className="space-y-6">
      {/* Avatar + name + follow counts */}
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
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            {profile.displayName}
            <VerificationBadge badgeType={badgeType} size="md" />
          </h1>
          {/* Follow counts */}
          <div className="flex gap-3 text-sm text-muted-foreground mt-1">
            <button
              type="button"
              onClick={() => setActiveTab("followers")}
              className="hover:underline"
            >
              {t("followerCount", { count: profile.followerCount })}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("following")}
              className="hover:underline"
            >
              {t("followingCount", { count: profile.followingCount })}
            </button>
          </div>
        </div>
        {/* FollowButton — only for other members' profiles */}
        {!isOwnProfile && (
          <div className="ml-auto">
            <FollowButton targetUserId={profile.userId} targetName={profile.displayName} />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div role="tablist" className="flex gap-4 border-b">
        {(["about", "followers", "following"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "about"
              ? t("aboutTab")
              : tab === "followers"
                ? t("followersTab")
                : t("followingTab")}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {activeTab === "about" && (
        <div role="tabpanel" className="space-y-6">
          {/* Bio */}
          {profile.bio && <p className="text-sm text-gray-700">{profile.bio}</p>}

          {/* Location — only render if location fields are present */}
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

          {/* Message button — uses create-conversation server action */}
          <MessageButton profileUserId={profile.userId} />
        </div>
      )}

      {activeTab === "followers" && (
        <div role="tabpanel">
          <FollowList userId={profile.userId} type="followers" viewerUserId={viewerUserId} />
        </div>
      )}

      {activeTab === "following" && (
        <div role="tabpanel">
          <FollowList userId={profile.userId} type="following" viewerUserId={viewerUserId} />
        </div>
      )}
    </div>
  );
}
