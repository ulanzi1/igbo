// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  setRequestLocale: vi.fn(),
}));

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

const mockAuth = vi.fn();
vi.mock("@/server/auth/config", () => ({
  auth: () => mockAuth(),
}));

const mockGetProfileByUserId = vi.fn();
vi.mock("@/db/queries/community-profiles", () => ({
  getProfileByUserId: (...args: unknown[]) => mockGetProfileByUserId(...args),
}));

vi.mock("@/features/discover/components/DiscoverContent", () => ({
  DiscoverContent: ({
    viewerProfile,
  }: {
    viewerProfile: {
      locationCity: string | null;
      locationCountry: string | null;
      interests: string[];
    } | null;
  }) => <div data-testid="discover-content" data-location={viewerProfile?.locationCity ?? ""} />,
}));

import DiscoverPage from "./page";

const MOCK_PROFILE = {
  userId: "user-1",
  displayName: "Chidi",
  locationCity: "Lagos",
  locationCountry: "Nigeria",
  interests: ["music"],
  locationVisible: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "user-1" } });
  mockGetProfileByUserId.mockResolvedValue(MOCK_PROFILE);
});

describe("DiscoverPage", () => {
  it("renders DiscoverSearch and MemberGrid (via DiscoverContent)", async () => {
    const Page = await DiscoverPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page!);
    expect(screen.getByTestId("discover-content")).toBeInTheDocument();
  });

  it("passes viewer profile location to DiscoverContent", async () => {
    const Page = await DiscoverPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page!);
    const content = screen.getByTestId("discover-content");
    expect(content.dataset.location).toBe("Lagos");
  });

  it("redirects to login when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const result = await DiscoverPage({ params: Promise.resolve({ locale: "en" }) });
    expect(result).toBeNull();
    expect(mockRedirect).toHaveBeenCalled();
  });

  it("renders with null viewerProfile when profile not found", async () => {
    mockGetProfileByUserId.mockResolvedValue(null);
    const Page = await DiscoverPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page!);
    const content = screen.getByTestId("discover-content");
    expect(content.dataset.location).toBe("");
  });
});
