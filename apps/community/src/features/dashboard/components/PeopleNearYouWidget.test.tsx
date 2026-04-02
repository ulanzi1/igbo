// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";

const mockDismiss = vi.fn();
const mockUseMemberSuggestions = vi.fn();

vi.mock("../hooks/use-member-suggestions", () => ({
  useMemberSuggestions: (...args: unknown[]) => mockUseMemberSuggestions(...args),
}));

vi.mock("@/i18n/navigation", () => ({
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

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
}));

const USER_B = "00000000-0000-4000-8000-000000000002";
const USER_C = "00000000-0000-4000-8000-000000000003";

function makeSuggestion(
  userId: string,
  displayName: string,
  reasonType: "city" | "state" | "country" | "interest" | "community",
  reasonValue: string,
) {
  return {
    member: {
      userId,
      displayName,
      photoUrl: null,
      locationCity: reasonType === "city" ? reasonValue : null,
      locationState: reasonType === "state" ? reasonValue : null,
      locationCountry: reasonType === "country" ? reasonValue : null,
      interests: reasonType === "interest" ? [reasonValue] : [],
      languages: [],
      membershipTier: "BASIC" as const,
      bio: null,
    },
    reasonType,
    reasonValue,
  };
}

import { PeopleNearYouWidget } from "./PeopleNearYouWidget";

beforeEach(() => {
  vi.clearAllMocks();
  mockUseMemberSuggestions.mockReturnValue({
    suggestions: [],
    isLoading: false,
    isError: false,
    dismiss: mockDismiss,
  });
});

describe("PeopleNearYouWidget", () => {
  it("renders skeleton while loading", () => {
    mockUseMemberSuggestions.mockReturnValue({
      suggestions: [],
      isLoading: true,
      isError: false,
      dismiss: mockDismiss,
    });
    render(<PeopleNearYouWidget />);
    // Skeleton loading state includes aria-label
    expect(screen.getByLabelText("peopleNear.loadingAriaLabel")).toBeInTheDocument();
  });

  it("renders empty state when suggestions is empty", () => {
    render(<PeopleNearYouWidget />);
    expect(screen.getByText("peopleNear.noSuggestions")).toBeInTheDocument();
  });

  it("renders up to 5 suggestion cards", () => {
    const suggestions = [
      makeSuggestion(USER_B, "Alice", "city", "Houston"),
      makeSuggestion(USER_C, "Bob", "community", ""),
    ];
    mockUseMemberSuggestions.mockReturnValue({
      suggestions,
      isLoading: false,
      isError: false,
      dismiss: mockDismiss,
    });
    render(<PeopleNearYouWidget />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("each card shows member displayName", () => {
    mockUseMemberSuggestions.mockReturnValue({
      suggestions: [makeSuggestion(USER_B, "Alice Obi", "community", "")],
      isLoading: false,
      isError: false,
      dismiss: mockDismiss,
    });
    render(<PeopleNearYouWidget />);
    expect(screen.getByText("Alice Obi")).toBeInTheDocument();
  });

  it("shows formatted reason string for city reason type", () => {
    mockUseMemberSuggestions.mockReturnValue({
      suggestions: [makeSuggestion(USER_B, "Alice", "city", "Houston")],
      isLoading: false,
      isError: false,
      dismiss: mockDismiss,
    });
    render(<PeopleNearYouWidget />);
    expect(screen.getByText('peopleNear.reasonCity({"location":"Houston"})')).toBeInTheDocument();
  });

  it("shows formatted reason string for interest reason type", () => {
    mockUseMemberSuggestions.mockReturnValue({
      suggestions: [makeSuggestion(USER_B, "Alice", "interest", "Cultural Heritage")],
      isLoading: false,
      isError: false,
      dismiss: mockDismiss,
    });
    render(<PeopleNearYouWidget />);
    expect(
      screen.getByText('peopleNear.reasonInterest({"interest":"Cultural Heritage"})'),
    ).toBeInTheDocument();
  });

  it("renders nearby count text when suggestions exist", () => {
    mockUseMemberSuggestions.mockReturnValue({
      suggestions: [
        makeSuggestion(USER_B, "Alice", "city", "Houston"),
        makeSuggestion(USER_C, "Bob", "community", ""),
        makeSuggestion("00000000-0000-4000-8000-000000000004", "Carol", "community", ""),
      ],
      isLoading: false,
      isError: false,
      dismiss: mockDismiss,
    });
    render(<PeopleNearYouWidget />);
    expect(screen.getByText('peopleNear.membersNearby({"count":3})')).toBeInTheDocument();
  });

  it("dismiss button click calls dismiss with member userId", () => {
    mockUseMemberSuggestions.mockReturnValue({
      suggestions: [makeSuggestion(USER_B, "Alice", "city", "Houston")],
      isLoading: false,
      isError: false,
      dismiss: mockDismiss,
    });
    render(<PeopleNearYouWidget />);
    const dismissBtn = screen.getByLabelText(`peopleNear.dismissAriaLabel({"name":"Alice"})`);
    fireEvent.click(dismissBtn);
    expect(mockDismiss).toHaveBeenCalledWith(USER_B);
  });

  it("See all link renders with correct href /discover", () => {
    mockUseMemberSuggestions.mockReturnValue({
      suggestions: [makeSuggestion(USER_B, "Alice", "community", "")],
      isLoading: false,
      isError: false,
      dismiss: mockDismiss,
    });
    render(<PeopleNearYouWidget />);
    const link = screen.getByText("peopleNear.seeAll").closest("a");
    expect(link).toHaveAttribute("href", "/discover");
  });

  it("dismiss button meets 44px tap target (h-11 w-11 classes)", () => {
    mockUseMemberSuggestions.mockReturnValue({
      suggestions: [makeSuggestion(USER_B, "Alice", "community", "")],
      isLoading: false,
      isError: false,
      dismiss: mockDismiss,
    });
    render(<PeopleNearYouWidget />);
    const dismissBtn = screen.getByLabelText(`peopleNear.dismissAriaLabel({"name":"Alice"})`);
    expect(dismissBtn.className).toContain("h-11");
    expect(dismissBtn.className).toContain("w-11");
  });

  it("Message button meets 44px tap target (min-h-[44px] class)", () => {
    mockUseMemberSuggestions.mockReturnValue({
      suggestions: [makeSuggestion(USER_B, "Alice", "community", "")],
      isLoading: false,
      isError: false,
      dismiss: mockDismiss,
    });
    render(<PeopleNearYouWidget />);
    const msgBtn = screen.getByText("peopleNear.messageCta").closest("a");
    expect(msgBtn?.closest("button")?.className ?? msgBtn?.className).toContain("min-h-[44px]");
  });

  it("renders error state when isError is true", () => {
    mockUseMemberSuggestions.mockReturnValue({
      suggestions: [],
      isLoading: false,
      isError: true,
      dismiss: mockDismiss,
    });
    render(<PeopleNearYouWidget />);
    expect(screen.getByText("peopleNear.title")).toBeInTheDocument();
    expect(screen.getByText("peopleNear.noSuggestions")).toBeInTheDocument();
  });

  it("profile link renders as anchor with correct href", () => {
    mockUseMemberSuggestions.mockReturnValue({
      suggestions: [makeSuggestion(USER_B, "Alice", "city", "Houston")],
      isLoading: false,
      isError: false,
      dismiss: mockDismiss,
    });
    render(<PeopleNearYouWidget />);
    const profileLink = screen.getByLabelText(`peopleNear.viewProfile({"name":"Alice"})`);
    expect(profileLink.tagName).toBe("A");
    expect(profileLink).toHaveAttribute("href", `/members/${USER_B}`);
  });

  it("Message button links to chat with correct userId", () => {
    mockUseMemberSuggestions.mockReturnValue({
      suggestions: [makeSuggestion(USER_B, "Alice", "city", "Houston")],
      isLoading: false,
      isError: false,
      dismiss: mockDismiss,
    });
    render(<PeopleNearYouWidget />);
    const msgLink = screen.getByText("peopleNear.messageCta").closest("a");
    expect(msgLink).toHaveAttribute("href", `/chat?userId=${USER_B}`);
  });
});
