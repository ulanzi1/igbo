// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/test-utils";

// ─── Mock server-only modules ──────────────────────────────────────────────

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns?: string | { locale: string; namespace: string }) => {
    const namespace = typeof ns === "string" ? ns : ns?.namespace;
    return (key: string) => `${namespace}.${key}`;
  },
  setRequestLocale: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/apply",
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  redirect: vi.fn(),
  getPathname: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (key: string) => {
      const geoHeaders: Record<string, string> = {
        "CF-IPCity": "Lagos",
        "CF-IPRegion": "Lagos State",
        "CF-IPCountry": "NG",
      };
      return geoHeaders[key] ?? null;
    },
  }),
}));

vi.mock("@/features/auth", () => ({
  ApplicationForm: ({
    geoDefaults,
  }: {
    geoDefaults: { city: string; state: string; country: string };
  }) => (
    <div
      data-testid="application-form"
      data-city={geoDefaults.city}
      data-country={geoDefaults.country}
    >
      Application Form
    </div>
  ),
  ResendForm: ({ emailPlaceholder }: { emailPlaceholder: string }) => (
    <div data-testid="resend-form">
      <input type="email" placeholder={emailPlaceholder} />
    </div>
  ),
}));

import ApplyPage from "./page";

describe("ApplyPage", () => {
  const defaultParams = { params: Promise.resolve({ locale: "en" }) };

  describe("default state (no status param)", () => {
    it("renders the ApplicationForm with geo defaults", async () => {
      const Page = await ApplyPage({
        ...defaultParams,
        searchParams: Promise.resolve({}),
      });
      render(Page);
      const form = screen.getByTestId("application-form");
      expect(form).toBeInTheDocument();
      expect(form).toHaveAttribute("data-city", "Lagos");
      expect(form).toHaveAttribute("data-country", "NG");
    });
  });

  describe("email-verified status", () => {
    it("renders the email verified confirmation with h1", async () => {
      const Page = await ApplyPage({
        ...defaultParams,
        searchParams: Promise.resolve({ status: "email-verified" }),
      });
      render(Page);
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
      expect(screen.getByText("Apply.emailVerified.title")).toBeInTheDocument();
      expect(screen.getByText("Apply.emailVerified.description")).toBeInTheDocument();
    });

    it("renders a back to home link", async () => {
      const Page = await ApplyPage({
        ...defaultParams,
        searchParams: Promise.resolve({ status: "email-verified" }),
      });
      render(Page);
      const link = screen.getByRole("link", { name: /Apply\.backToHome/i });
      expect(link).toHaveAttribute("href", "/");
    });

    it("does NOT render the application form", async () => {
      const Page = await ApplyPage({
        ...defaultParams,
        searchParams: Promise.resolve({ status: "email-verified" }),
      });
      render(Page);
      expect(screen.queryByTestId("application-form")).not.toBeInTheDocument();
    });
  });

  describe("token-expired status", () => {
    it("renders expired heading and resend form", async () => {
      const Page = await ApplyPage({
        ...defaultParams,
        searchParams: Promise.resolve({ status: "token-expired" }),
      });
      render(Page);
      expect(screen.getByText("Apply.tokenExpired.title")).toBeInTheDocument();
      expect(screen.getByTestId("resend-form")).toBeInTheDocument();
    });

    it("does NOT render the application form", async () => {
      const Page = await ApplyPage({
        ...defaultParams,
        searchParams: Promise.resolve({ status: "token-expired" }),
      });
      render(Page);
      expect(screen.queryByTestId("application-form")).not.toBeInTheDocument();
    });
  });

  describe("token-invalid status", () => {
    it("renders invalid heading and resend form", async () => {
      const Page = await ApplyPage({
        ...defaultParams,
        searchParams: Promise.resolve({ status: "token-invalid" }),
      });
      render(Page);
      expect(screen.getByText("Apply.tokenInvalid.title")).toBeInTheDocument();
      expect(screen.getByTestId("resend-form")).toBeInTheDocument();
    });
  });

  describe("unknown status param", () => {
    it("falls back to showing the application form", async () => {
      const Page = await ApplyPage({
        ...defaultParams,
        searchParams: Promise.resolve({ status: "something-unknown" }),
      });
      render(Page);
      expect(screen.getByTestId("application-form")).toBeInTheDocument();
    });
  });

  describe("geo header prefill", () => {
    it("passes geo defaults to the application form", async () => {
      const Page = await ApplyPage({
        ...defaultParams,
        searchParams: Promise.resolve({}),
      });
      render(Page);
      const form = screen.getByTestId("application-form");
      expect(form).toHaveAttribute("data-city", "Lagos");
      expect(form).toHaveAttribute("data-country", "NG");
    });
  });

  describe("metadata generation", () => {
    it("generateMetadata returns SEO title and description", async () => {
      const { generateMetadata } = await import("./page");
      const meta = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
      expect(meta.title).toBe("SEO.applyTitle");
      expect(meta.description).toBe("SEO.applyDescription");
    });
  });
});
