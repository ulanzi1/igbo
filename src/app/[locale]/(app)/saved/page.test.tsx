// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/auth/config", () => ({ auth: vi.fn() }));
vi.mock("@/services/bookmark-service", () => ({ getUserBookmarks: vi.fn() }));
vi.mock("@/features/feed/components/SavedPostsList", () => ({
  SavedPostsList: () => null,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
  getLocale: vi.fn().mockResolvedValue("en"),
}));
vi.mock("@/i18n/navigation", () => ({
  redirect: vi.fn(),
}));

import { auth } from "@/server/auth/config";
import { getUserBookmarks } from "@/services/bookmark-service";
import { redirect } from "@/i18n/navigation";
import SavedPage from "./page";

const mockAuth = vi.mocked(auth);
const mockGetUserBookmarks = vi.mocked(getUserBookmarks);
const mockRedirect = vi.mocked(redirect);

beforeEach(() => {
  mockAuth.mockReset();
  mockGetUserBookmarks.mockReset();
  mockRedirect.mockReset();
  // Default: empty bookmarks
  mockGetUserBookmarks.mockResolvedValue({ posts: [], nextCursor: null });
});

describe("SavedPage", () => {
  it("redirects to /login when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    mockRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(SavedPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith({ href: "/login", locale: "en" });
  });

  it("redirects when session has no user id", async () => {
    mockAuth.mockResolvedValue({ user: {} } as Awaited<ReturnType<typeof auth>>);
    mockRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(SavedPage()).rejects.toThrow("NEXT_REDIRECT");
  });

  it("calls getUserBookmarks with session userId", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", role: "MEMBER" },
    } as Awaited<ReturnType<typeof auth>>);

    await SavedPage();

    expect(mockGetUserBookmarks).toHaveBeenCalledWith("user-1", { limit: 10 });
  });

  it("renders page without error when authenticated", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", role: "MEMBER" },
    } as Awaited<ReturnType<typeof auth>>);

    const result = await SavedPage();

    expect(result).not.toBeNull();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
