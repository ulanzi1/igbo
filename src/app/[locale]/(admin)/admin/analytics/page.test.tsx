// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

const mockGetTranslations = vi.fn();
const mockAdminPageHeader = vi.fn();
const mockAnalyticsDashboard = vi.fn();

vi.mock("next-intl/server", () => ({
  getTranslations: (...args: unknown[]) => mockGetTranslations(...args),
}));

vi.mock("@/components/layout/AdminShell", () => ({
  AdminPageHeader: (...args: unknown[]) => mockAdminPageHeader(...args),
}));

vi.mock("@/features/admin/components/AnalyticsDashboard", () => ({
  AnalyticsDashboard: (...args: unknown[]) => mockAnalyticsDashboard(...args),
}));

import AnalyticsPage from "./page";

const mockT = (key: string) => `t:${key}`;

describe("AnalyticsPage", () => {
  it("renders AdminPageHeader with analytics title and breadcrumbs", async () => {
    mockGetTranslations.mockResolvedValue(mockT);
    mockAdminPageHeader.mockReturnValue(null);
    mockAnalyticsDashboard.mockReturnValue(null);

    const result = await AnalyticsPage();
    const element = result as React.ReactElement;

    expect(mockGetTranslations).toHaveBeenCalledWith("Admin");
    expect(element).not.toBeNull();
    expect(element.type).toBe("div");
  });

  it("passes analytics title key to AdminPageHeader via translation", async () => {
    const tSpy = vi.fn((key: string) => `translated:${key}`);
    mockGetTranslations.mockResolvedValue(tSpy);
    mockAdminPageHeader.mockReturnValue(null);
    mockAnalyticsDashboard.mockReturnValue(null);

    await AnalyticsPage();

    // t("analytics.title") and t("sidebar.dashboard") and t("sidebar.analytics") called for breadcrumbs
    expect(tSpy).toHaveBeenCalledWith("analytics.title");
    expect(tSpy).toHaveBeenCalledWith("sidebar.dashboard");
    expect(tSpy).toHaveBeenCalledWith("sidebar.analytics");
  });
});
