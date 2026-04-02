// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns?: string | { locale: string; namespace: string }) => {
    const namespace = typeof ns === "string" ? ns : ns?.namespace;
    return (key: string) => `${namespace}.${key}`;
  },
  setRequestLocale: vi.fn(),
}));

import PrivacyPage from "./page";

describe("PrivacyPage", () => {
  it("renders i18n heading and content", async () => {
    const Page = await PrivacyPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getByText("Privacy.heading")).toBeInTheDocument();
    expect(screen.getByText("Privacy.content")).toBeInTheDocument();
  });

  it("renders last updated note", async () => {
    const Page = await PrivacyPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getByText("Privacy.lastUpdated")).toBeInTheDocument();
  });

  it("has a single h1", async () => {
    const Page = await PrivacyPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
