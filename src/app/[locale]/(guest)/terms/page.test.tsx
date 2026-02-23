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

import TermsPage from "./page";

describe("TermsPage", () => {
  it("renders i18n heading and content", async () => {
    const Page = await TermsPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getByText("Terms.heading")).toBeInTheDocument();
    expect(screen.getByText("Terms.content")).toBeInTheDocument();
  });

  it("renders last updated note", async () => {
    const Page = await TermsPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getByText("Terms.lastUpdated")).toBeInTheDocument();
  });

  it("has a single h1", async () => {
    const Page = await TermsPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
