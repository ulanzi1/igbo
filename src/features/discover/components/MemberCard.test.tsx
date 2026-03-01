// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";
import { MemberCard } from "./MemberCard";
import type { MemberCardData } from "../types";

const mockPush = vi.fn();
const mockCreateOrFind = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${namespace}.${key}(${JSON.stringify(params)})`;
    return `${namespace}.${key}`;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}));

vi.mock("@/features/chat/actions/create-conversation", () => ({
  createOrFindDirectConversation: (...args: unknown[]) => mockCreateOrFind(...args),
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("div", { "data-testid": "avatar", ...props }, children),
  AvatarImage: (props: Record<string, unknown>) =>
    React.createElement("img", { "data-testid": "avatar-image", ...props }),
  AvatarFallback: ({ children }: React.PropsWithChildren) =>
    React.createElement("span", { "data-testid": "avatar-fallback" }, children),
}));

const baseMember: MemberCardData = {
  userId: "00000000-0000-4000-8000-000000000002",
  displayName: "Alice Obi",
  bio: "I love Igbo culture and music",
  photoUrl: null,
  locationCity: "Lagos",
  locationState: "Lagos State",
  locationCountry: "Nigeria",
  interests: ["music", "culture", "dance"],
  languages: ["Igbo", "English"],
  membershipTier: "BASIC",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateOrFind.mockResolvedValue({ conversationId: "conv-123" });
});

describe("MemberCard", () => {
  it("renders displayName, bio snippet, and location", () => {
    render(<MemberCard member={baseMember} viewerInterests={[]} />);

    expect(screen.getByText("Alice Obi")).toBeInTheDocument();
    expect(screen.getByText("I love Igbo culture and music")).toBeInTheDocument();
    expect(screen.getByText("Lagos, Nigeria")).toBeInTheDocument();
  });

  it("shows shared interests count when viewer shares interests", () => {
    render(<MemberCard member={baseMember} viewerInterests={["music", "culture"]} />);

    // sharedCount = 2
    expect(screen.getByText(/sharedInterests.*count.*2/)).toBeInTheDocument();
  });

  it("shows 0 shared interests when none in common", () => {
    render(<MemberCard member={baseMember} viewerInterests={["coding", "sports"]} />);

    expect(screen.getByText(/sharedInterests.*count.*0/)).toBeInTheDocument();
  });

  it("Message button calls onMessage prop when provided", () => {
    const onMessage = vi.fn();
    render(<MemberCard member={baseMember} viewerInterests={[]} onMessage={onMessage} />);

    const messageBtn = screen.getByRole("button", { name: /Discover\.messageButton/ });
    fireEvent.click(messageBtn);

    expect(onMessage).toHaveBeenCalledWith(baseMember.userId);
    expect(mockCreateOrFind).not.toHaveBeenCalled();
  });

  it("card click navigates to profile page", () => {
    render(<MemberCard member={baseMember} viewerInterests={[]} />);

    const card = screen.getByRole("button", { name: /viewProfile/ });
    fireEvent.click(card);

    expect(mockPush).toHaveBeenCalledWith(`/profiles/${baseMember.userId}`);
  });

  it("renders gracefully when bio is null", () => {
    const memberNoBio: MemberCardData = { ...baseMember, bio: null };
    render(<MemberCard member={memberNoBio} viewerInterests={[]} />);

    expect(screen.getByText("Alice Obi")).toBeInTheDocument();
    // bio should not be rendered
    expect(screen.queryByText("I love Igbo culture and music")).not.toBeInTheDocument();
  });

  it("renders gracefully when location fields are null", () => {
    const memberNoLocation: MemberCardData = {
      ...baseMember,
      locationCity: null,
      locationState: null,
      locationCountry: null,
    };
    render(<MemberCard member={memberNoLocation} viewerInterests={[]} />);

    expect(screen.getByText("Alice Obi")).toBeInTheDocument();
    // Location should not be rendered at all
    expect(screen.queryByText("Lagos, Nigeria")).not.toBeInTheDocument();
  });

  it("truncates long bio to 80 characters", () => {
    const longBio = "A".repeat(100);
    const memberLongBio: MemberCardData = { ...baseMember, bio: longBio };
    render(<MemberCard member={memberLongBio} viewerInterests={[]} />);

    const truncated = screen.getByText(`${"A".repeat(80)}...`);
    expect(truncated).toBeInTheDocument();
  });
});
