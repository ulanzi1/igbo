// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: () => (key: string) => key,
}));

const mockAuth = vi.fn();
vi.mock("@igbo/auth", () => ({
  auth: () => mockAuth(),
}));

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("@/components/domain/saved-search-list", () => ({
  SavedSearchList: () => "SavedSearchList",
}));

import SavedSearchesPage from "./page";

beforeEach(() => vi.clearAllMocks());

describe("SavedSearchesPage", () => {
  const params = Promise.resolve({ locale: "en" });

  it("redirects unauthenticated users", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(SavedSearchesPage({ params })).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/en");
  });

  it("redirects non-seeker roles", async () => {
    mockAuth.mockResolvedValue({ user: { activePortalRole: "EMPLOYER" } });
    await expect(SavedSearchesPage({ params })).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/en");
  });

  it("renders for JOB_SEEKER", async () => {
    mockAuth.mockResolvedValue({ user: { activePortalRole: "JOB_SEEKER" } });
    const result = await SavedSearchesPage({ params });
    expect(result).toBeDefined();
  });
});
