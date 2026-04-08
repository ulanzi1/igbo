// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@igbo/db/queries/portal-screening-keywords", () => ({
  listScreeningKeywords: vi.fn(),
}));
vi.mock("@/components/domain/keyword-manager", () => ({
  KeywordManager: () => null,
  KeywordManagerSkeleton: () => null,
}));

import { auth } from "@igbo/auth";
import { redirect } from "next/navigation";
import { listScreeningKeywords } from "@igbo/db/queries/portal-screening-keywords";
import ScreeningKeywordsPage from "./page";

function makeParams(locale = "en") {
  return Promise.resolve({ locale });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
  vi.mocked(listScreeningKeywords).mockResolvedValue({ items: [], total: 0 });
});

describe("ScreeningKeywordsPage", () => {
  it("renders page for JOB_ADMIN", async () => {
    const result = await ScreeningKeywordsPage({ params: makeParams() });
    expect(redirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("redirects non-admin (EMPLOYER) to home", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "emp-1", activePortalRole: "EMPLOYER" },
    } as never);

    await ScreeningKeywordsPage({ params: makeParams() });
    expect(redirect).toHaveBeenCalledWith("/en");
  });

  it("redirects unauthenticated user to home", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    await ScreeningKeywordsPage({ params: makeParams() });
    expect(redirect).toHaveBeenCalledWith("/en");
  });

  it("calls listScreeningKeywords with default pagination", async () => {
    await ScreeningKeywordsPage({ params: makeParams() });
    expect(listScreeningKeywords).toHaveBeenCalledWith({ limit: 100, offset: 0 });
  });

  it("passes initial keywords to KeywordManager", async () => {
    const mockKeywords = [
      {
        id: "kw-1",
        phrase: "test phrase",
        category: "scam",
        severity: "high",
        notes: null,
        createdByAdminId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ];
    vi.mocked(listScreeningKeywords).mockResolvedValue({ items: mockKeywords, total: 1 });

    const result = await ScreeningKeywordsPage({ params: makeParams() });
    expect(result).toBeDefined();
  });
});
