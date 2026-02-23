// @vitest-environment jsdom
import { render, screen } from "@/test/test-utils";
import { describe, it, expect, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace}.${key}`,
  useLocale: () => "en",
}));

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/i18n/routing", () => ({
  routing: { locales: ["en", "ig"], defaultLocale: "en" },
}));

vi.mock("lucide-react", () => ({
  WifiOffIcon: () => <svg data-testid="wifi-off-icon" />,
}));

describe("OfflinePage", () => {
  it("renders offline title via EmptyState", async () => {
    const { default: OfflinePage } = await import("./page");
    const jsx = await OfflinePage({ params: Promise.resolve({ locale: "en" }) });
    render(jsx as React.ReactElement);
    expect(screen.getByText("Errors.offline")).toBeInTheDocument();
  });

  it("renders offline description via EmptyState", async () => {
    const { default: OfflinePage } = await import("./page");
    const jsx = await OfflinePage({ params: Promise.resolve({ locale: "en" }) });
    render(jsx as React.ReactElement);
    expect(screen.getByText("Errors.offlineDescription")).toBeInTheDocument();
  });

  it("has main-content id on main element", async () => {
    const { default: OfflinePage } = await import("./page");
    const jsx = await OfflinePage({ params: Promise.resolve({ locale: "en" }) });
    render(jsx as React.ReactElement);
    expect(document.getElementById("main-content")).toBeInTheDocument();
  });

  it("generateStaticParams returns en and ig locales", async () => {
    const { generateStaticParams } = await import("./page");
    const params = generateStaticParams();
    expect(params).toContainEqual({ locale: "en" });
    expect(params).toContainEqual({ locale: "ig" });
  });
});
