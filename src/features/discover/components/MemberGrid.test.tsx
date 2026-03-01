// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/features/chat/actions/create-conversation", () => ({
  createOrFindDirectConversation: vi.fn(),
}));

vi.mock("@/features/profiles/components/FollowButton", () => ({
  FollowButton: () => React.createElement("button", { "data-testid": "follow-button" }, "Follow"),
}));

const mockUseDiscover = vi.fn();
vi.mock("../hooks/use-discover", () => ({
  useDiscover: () => mockUseDiscover(),
}));

// Mock IntersectionObserver — must use a regular function (not arrow) so `new` works
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
let lastObserverCallback: ((entries: IntersectionObserverEntry[]) => void) | null = null;

global.IntersectionObserver = vi.fn().mockImplementation(function (
  this: unknown,
  callback: (entries: IntersectionObserverEntry[]) => void,
) {
  lastObserverCallback = callback;
  (this as { observe: typeof mockObserve; disconnect: typeof mockDisconnect }).observe =
    mockObserve;
  (this as { observe: typeof mockObserve; disconnect: typeof mockDisconnect }).disconnect =
    mockDisconnect;
}) as unknown as typeof IntersectionObserver;

import { MemberGrid } from "./MemberGrid";
import { DEFAULT_FILTERS } from "../types";
import type { MemberCardData } from "../types";

const mockMember: MemberCardData = {
  userId: "00000000-0000-4000-8000-000000000002",
  displayName: "Alice Obi",
  bio: "Community member",
  photoUrl: null,
  locationCity: "Lagos",
  locationState: null,
  locationCountry: "Nigeria",
  interests: ["music"],
  languages: ["Igbo"],
  membershipTier: "BASIC",
};

const defaultDiscoverState = {
  data: undefined,
  isPending: false,
  isError: false,
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
  refetch: vi.fn(),
  isSuccess: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockObserve.mockClear();
  mockDisconnect.mockClear();
  mockUseDiscover.mockReturnValue(defaultDiscoverState);
});

describe("MemberGrid", () => {
  it("renders skeleton cards while loading", () => {
    mockUseDiscover.mockReturnValue({ ...defaultDiscoverState, isPending: true });

    render(<MemberGrid filters={DEFAULT_FILTERS} viewerInterests={[]} />);

    // 5 skeleton cards rendered
    const skeletons = document.querySelectorAll(".rounded-lg.border");
    expect(skeletons.length).toBeGreaterThanOrEqual(5);
  });

  it("renders member cards after data loads", () => {
    mockUseDiscover.mockReturnValue({
      ...defaultDiscoverState,
      data: { pages: [{ members: [mockMember], hasMore: false, nextCursor: null }] },
      isSuccess: true,
    });

    render(<MemberGrid filters={DEFAULT_FILTERS} viewerInterests={[]} />);

    expect(screen.getByText("Alice Obi")).toBeInTheDocument();
  });

  it("shows empty state when results are empty", () => {
    mockUseDiscover.mockReturnValue({
      ...defaultDiscoverState,
      data: { pages: [{ members: [], hasMore: false, nextCursor: null }] },
      isSuccess: true,
    });

    render(<MemberGrid filters={DEFAULT_FILTERS} viewerInterests={[]} />);

    expect(screen.getByText("Discover.noResults")).toBeInTheDocument();
  });

  it("shows error state when fetch fails", () => {
    mockUseDiscover.mockReturnValue({
      ...defaultDiscoverState,
      isError: true,
      refetch: vi.fn(),
    });

    render(<MemberGrid filters={DEFAULT_FILTERS} viewerInterests={[]} />);

    expect(screen.getByText("Discover.loadingError")).toBeInTheDocument();
    expect(screen.getByText("Discover.retry")).toBeInTheDocument();
  });

  it("calls fetchNextPage when sentinel intersects viewport", async () => {
    const fetchNextPage = vi.fn();
    lastObserverCallback = null;
    mockUseDiscover.mockReturnValue({
      ...defaultDiscoverState,
      data: { pages: [{ members: [mockMember], hasMore: true, nextCursor: "cursor" }] },
      isSuccess: true,
      hasNextPage: true,
      fetchNextPage,
    });

    render(<MemberGrid filters={DEFAULT_FILTERS} viewerInterests={[]} />);

    // Simulate IntersectionObserver firing with intersection
    await act(async () => {
      lastObserverCallback?.([{ isIntersecting: true } as unknown as IntersectionObserverEntry]);
    });

    expect(fetchNextPage).toHaveBeenCalled();
  });
});
