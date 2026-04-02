// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/test-utils";
import { ProfileView } from "./ProfileView";
import type { CommunityProfile, CommunitySocialLink } from "@/db/schema/community-profiles";

const mockPush = vi.fn();
const mockCreateOrFind = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${namespace}.${key}(${JSON.stringify(params)})`;
    return `${namespace}.${key}`;
  },
  useLocale: () => "en",
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  usePathname: () => "/profiles/user-2",
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "current-user-id" } },
    status: "authenticated",
  }),
}));

vi.mock("@/features/chat/actions/create-conversation", () => ({
  createOrFindDirectConversation: (...args: unknown[]) => mockCreateOrFind(...args),
}));

vi.mock("./FollowButton", () => ({
  FollowButton: () => <div data-testid="follow-button" />,
}));

vi.mock("@/components/notifications/DndIndicator", () => ({
  DndIndicator: () => null,
}));

vi.mock("./FollowList", () => ({
  FollowList: ({ type }: { type: string }) => <div data-testid={`follow-list-${type}`} />,
}));

const baseProfile: CommunityProfile = {
  userId: "user-2",
  displayName: "Test User",
  bio: "A bio",
  photoUrl: null,
  locationCity: "Lagos",
  locationState: "Lagos State",
  locationCountry: "Nigeria",
  interests: ["Culture"],
  culturalConnections: ["Igbo"],
  languages: ["English"],
  profileVisibility: "public_to_members" as const,
  locationVisible: true,
  onboardingDisplayNameAt: new Date(),
  onboardingBioAt: new Date(),
  onboardingPhotoAt: null,
  onboardingInterestsAt: null,
  onboardingGuidelinesAt: null,
  onboardingTourAt: null,
  followerCount: 0,
  followingCount: 0,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const socialLinks: CommunitySocialLink[] = [];

describe("ProfileView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders profile display name and bio", () => {
    render(
      <ProfileView
        profile={baseProfile}
        socialLinks={socialLinks}
        viewerUserId="current-user-id"
      />,
    );
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("A bio")).toBeInTheDocument();
  });

  it("renders location when present", () => {
    render(
      <ProfileView
        profile={baseProfile}
        socialLinks={socialLinks}
        viewerUserId="current-user-id"
      />,
    );
    expect(screen.getByText("Lagos, Lagos State, Nigeria")).toBeInTheDocument();
  });

  it("renders interests tags", () => {
    render(
      <ProfileView
        profile={baseProfile}
        socialLinks={socialLinks}
        viewerUserId="current-user-id"
      />,
    );
    expect(screen.getByText("Culture")).toBeInTheDocument();
  });

  describe("MessageButton", () => {
    it("renders message button for other user's profile", () => {
      render(
        <ProfileView
          profile={baseProfile}
          socialLinks={socialLinks}
          viewerUserId="current-user-id"
        />,
      );
      const btn = screen.getByRole("button", { name: "Profile.messageButton" });
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveTextContent("Profile.messageButton");
    });

    it("does not render message button for own profile", () => {
      const ownProfile = { ...baseProfile, userId: "current-user-id" };
      render(
        <ProfileView
          profile={ownProfile}
          socialLinks={socialLinks}
          viewerUserId="current-user-id"
        />,
      );
      expect(
        screen.queryByRole("button", { name: "Profile.messageButton" }),
      ).not.toBeInTheDocument();
    });

    it("navigates to chat on successful conversation creation", async () => {
      mockCreateOrFind.mockResolvedValue({ conversationId: "conv-123" });
      render(
        <ProfileView
          profile={baseProfile}
          socialLinks={socialLinks}
          viewerUserId="current-user-id"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Profile.messageButton" }));

      await waitFor(() => {
        expect(mockCreateOrFind).toHaveBeenCalledWith("user-2");
        expect(mockPush).toHaveBeenCalledWith("/chat/conv-123");
      });
    });

    it("does not navigate when server action returns error", async () => {
      mockCreateOrFind.mockResolvedValue({ error: "Blocked" });
      render(
        <ProfileView
          profile={baseProfile}
          socialLinks={socialLinks}
          viewerUserId="current-user-id"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Profile.messageButton" }));

      await waitFor(() => {
        expect(mockCreateOrFind).toHaveBeenCalledWith("user-2");
      });
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe("FollowButton", () => {
    it("Follow button is NOT rendered for own profile", () => {
      const ownProfile = { ...baseProfile, userId: "current-user-id" };
      render(
        <ProfileView
          profile={ownProfile}
          socialLinks={socialLinks}
          viewerUserId="current-user-id"
        />,
      );
      expect(screen.queryByTestId("follow-button")).not.toBeInTheDocument();
    });

    it("Follow button IS rendered for other profiles", () => {
      render(
        <ProfileView
          profile={baseProfile}
          socialLinks={socialLinks}
          viewerUserId="current-user-id"
        />,
      );
      expect(screen.getByTestId("follow-button")).toBeInTheDocument();
    });
  });

  describe("Follow counts", () => {
    it("displays follower count and following count in header", () => {
      const profile = { ...baseProfile, followerCount: 5, followingCount: 3 };
      render(
        <ProfileView profile={profile} socialLinks={socialLinks} viewerUserId="current-user-id" />,
      );
      // The counts are rendered via t("followerCount", { count: 5 })
      expect(screen.getByText(/Profile\.followerCount/)).toBeInTheDocument();
      expect(screen.getByText(/Profile\.followingCount/)).toBeInTheDocument();
    });

    it("clicking follower count switches to Followers tab", () => {
      render(
        <ProfileView
          profile={baseProfile}
          socialLinks={socialLinks}
          viewerUserId="current-user-id"
        />,
      );
      // Find the follower count button and click it
      const followerBtn = screen.getByText(/Profile\.followerCount/);
      fireEvent.click(followerBtn);
      expect(screen.getByTestId("follow-list-followers")).toBeInTheDocument();
    });

    it("clicking following count switches to Following tab", () => {
      render(
        <ProfileView
          profile={baseProfile}
          socialLinks={socialLinks}
          viewerUserId="current-user-id"
        />,
      );
      const followingBtn = screen.getByText(/Profile\.followingCount/);
      fireEvent.click(followingBtn);
      expect(screen.getByTestId("follow-list-following")).toBeInTheDocument();
    });
  });

  describe("Tabs", () => {
    it("renders About, Followers, and Following tab buttons", () => {
      render(
        <ProfileView
          profile={baseProfile}
          socialLinks={socialLinks}
          viewerUserId="current-user-id"
        />,
      );
      expect(screen.getByRole("tab", { name: "Profile.aboutTab" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Profile.followersTab" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Profile.followingTab" })).toBeInTheDocument();
    });
  });
});
