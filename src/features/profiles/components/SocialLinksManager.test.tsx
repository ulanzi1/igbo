// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/test-utils";

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockUnlink = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/features/profiles/hooks/use-profile", () => ({
  useUnlinkSocialAccount: () => ({
    mutateAsync: mockUnlink,
    isPending: false,
  }),
}));

import { SocialLinksManager } from "./SocialLinksManager";
import type { CommunitySocialLink } from "@/db/schema/community-profiles";

const linkedFacebook: CommunitySocialLink = {
  userId: "u1",
  provider: "FACEBOOK",
  providerDisplayName: "John Doe",
  providerProfileUrl: "https://facebook.com/johndoe",
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SocialLinksManager", () => {
  it("renders all four provider rows", () => {
    render(<SocialLinksManager socialLinks={[]} />);

    expect(screen.getByText("Facebook")).toBeInTheDocument();
    expect(screen.getByText("LinkedIn")).toBeInTheDocument();
    expect(screen.getByText("Twitter / X")).toBeInTheDocument();
    expect(screen.getByText("Instagram")).toBeInTheDocument();
  });

  it("shows link buttons for unlinked providers", () => {
    render(<SocialLinksManager socialLinks={[]} />);

    const linkButtons = screen.getAllByText("Settings.privacy.socialLinks.link");
    expect(linkButtons).toHaveLength(4);
  });

  it("shows unlink button and display name for linked provider", () => {
    render(<SocialLinksManager socialLinks={[linkedFacebook]} />);

    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
    expect(screen.getByText("Settings.privacy.socialLinks.unlink")).toBeInTheDocument();

    // Other 3 providers show link button
    const linkButtons = screen.getAllByText("Settings.privacy.socialLinks.link");
    expect(linkButtons).toHaveLength(3);
  });

  it("navigates to OAuth URL when clicking link", () => {
    render(<SocialLinksManager socialLinks={[]} />);

    const linkButtons = screen.getAllByText("Settings.privacy.socialLinks.link");
    fireEvent.click(linkButtons[0]); // Facebook

    expect(mockPush).toHaveBeenCalledWith("/api/v1/profiles/social-link/facebook");
  });

  it("calls unlink mutation when clicking unlink", async () => {
    mockUnlink.mockResolvedValue(undefined);
    render(<SocialLinksManager socialLinks={[linkedFacebook]} />);

    fireEvent.click(screen.getByText("Settings.privacy.socialLinks.unlink"));

    await waitFor(() => {
      expect(mockUnlink).toHaveBeenCalledWith("FACEBOOK");
    });
  });

  it("shows success banner when linkedParam is set", () => {
    render(<SocialLinksManager socialLinks={[]} linkedParam="FACEBOOK" />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Settings.privacy.socialLinks.linkSuccess",
    );
  });

  it("shows error banner when errorParam is set", () => {
    render(<SocialLinksManager socialLinks={[]} errorParam="oauth_failed" />);

    expect(screen.getByRole("alert")).toHaveTextContent("Settings.privacy.socialLinks.linkError");
  });
});
