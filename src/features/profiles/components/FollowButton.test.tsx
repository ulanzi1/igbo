// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";
import { FollowButton } from "./FollowButton";

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${namespace}.${key}(${JSON.stringify(params)})`;
    return `${namespace}.${key}`;
  },
}));

vi.mock("../hooks/use-follow");

import { useFollow } from "../hooks/use-follow";

const mockUseFollow = vi.mocked(useFollow);
const mockFollow = vi.fn();
const mockUnfollow = vi.fn();

const TARGET_ID = "00000000-0000-4000-8000-000000000002";
const TARGET_NAME = "Alice Obi";

beforeEach(() => {
  vi.clearAllMocks();
  mockUseFollow.mockReturnValue({
    isFollowing: false,
    isLoading: false,
    follow: mockFollow,
    unfollow: mockUnfollow,
    isPending: false,
  });
});

describe("FollowButton", () => {
  it("renders loading state (disabled button) when isLoading is true", () => {
    mockUseFollow.mockReturnValue({
      isFollowing: false,
      isLoading: true,
      follow: mockFollow,
      unfollow: mockUnfollow,
      isPending: false,
    });

    render(<FollowButton targetUserId={TARGET_ID} targetName={TARGET_NAME} />);

    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });

  it("renders Follow button when isFollowing is false", () => {
    render(<FollowButton targetUserId={TARGET_ID} targetName={TARGET_NAME} />);

    const btn = screen.getByRole("button");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent("Profile.follow");
  });

  it("renders Following button (with Unfollow accessible label) when isFollowing is true", () => {
    mockUseFollow.mockReturnValue({
      isFollowing: true,
      isLoading: false,
      follow: mockFollow,
      unfollow: mockUnfollow,
      isPending: false,
    });

    render(<FollowButton targetUserId={TARGET_ID} targetName={TARGET_NAME} />);

    const btn = screen.getByRole("button");
    expect(btn).toBeInTheDocument();
    // aria-label contains the unfollow label
    expect(btn.getAttribute("aria-label")).toContain("Profile.followingAriaLabel");
  });

  it("clicking Follow button calls follow()", () => {
    render(<FollowButton targetUserId={TARGET_ID} targetName={TARGET_NAME} />);

    fireEvent.click(screen.getByRole("button"));
    expect(mockFollow).toHaveBeenCalled();
  });

  it("clicking Following button calls unfollow()", () => {
    mockUseFollow.mockReturnValue({
      isFollowing: true,
      isLoading: false,
      follow: mockFollow,
      unfollow: mockUnfollow,
      isPending: false,
    });

    render(<FollowButton targetUserId={TARGET_ID} targetName={TARGET_NAME} />);

    fireEvent.click(screen.getByRole("button"));
    expect(mockUnfollow).toHaveBeenCalled();
  });

  it("button is disabled when isPending is true", () => {
    mockUseFollow.mockReturnValue({
      isFollowing: false,
      isLoading: false,
      follow: mockFollow,
      unfollow: mockUnfollow,
      isPending: true,
    });

    render(<FollowButton targetUserId={TARGET_ID} targetName={TARGET_NAME} />);

    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("aria-label contains target member's name for Follow button", () => {
    render(<FollowButton targetUserId={TARGET_ID} targetName={TARGET_NAME} />);

    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toContain(TARGET_NAME);
  });
});
