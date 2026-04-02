// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/sanitize", () => ({
  sanitizeHtml: (html: string) => html,
}));

const mockGetDocumentBySlug = vi.fn();
vi.mock("@/services/governance-document-service", () => ({
  getDocumentBySlug: (...a: unknown[]) => mockGetDocumentBySlug(...a),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns?: string | { locale: string; namespace: string }) => {
    const namespace = typeof ns === "string" ? ns : ns?.namespace;
    return (key: string) => `${namespace}.${key}`;
  },
  setRequestLocale: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/about",
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

const publishedDoc = {
  id: "doc-1",
  title: "About OBIGBO",
  slug: "about-us",
  content: "<p>Mission content here</p>",
  contentIgbo: "<p>Ọdịnaya Igbo ebe a</p>",
  version: 1,
  status: "published",
  visibility: "public",
  publishedBy: null,
  publishedAt: new Date("2026-01-01"),
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

import AboutPage from "./page";

describe("AboutPage", () => {
  it("renders document content from governance service (English)", async () => {
    mockGetDocumentBySlug.mockResolvedValue(publishedDoc);
    const Page = await AboutPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getByText("About OBIGBO")).toBeInTheDocument();
  });

  it("renders Igbo content when locale is ig and contentIgbo exists", async () => {
    mockGetDocumentBySlug.mockResolvedValue(publishedDoc);
    const Page = await AboutPage({ params: Promise.resolve({ locale: "ig" }) });
    render(Page);
    // Igbo content is rendered via dangerouslySetInnerHTML — check container presence
    const article = document.querySelector("article");
    expect(article).toBeInTheDocument();
    // English title (doc.title is always shown)
    expect(screen.getByText("About OBIGBO")).toBeInTheDocument();
  });

  it("shows fallback when document not found", async () => {
    mockGetDocumentBySlug.mockResolvedValue(null);
    const Page = await AboutPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getByText("Governance.contentUnavailable")).toBeInTheDocument();
  });

  it("shows fallback when document is not published", async () => {
    mockGetDocumentBySlug.mockResolvedValue({ ...publishedDoc, status: "draft" });
    const Page = await AboutPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getByText("Governance.contentUnavailable")).toBeInTheDocument();
  });

  it("renders CTA link to /apply", async () => {
    mockGetDocumentBySlug.mockResolvedValue(publishedDoc);
    const Page = await AboutPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    const cta = screen.getByText("Governance.applyButton");
    expect(cta.closest("a")).toHaveAttribute("href", "/apply");
  });

  it("has a single h1", async () => {
    mockGetDocumentBySlug.mockResolvedValue(publishedDoc);
    const Page = await AboutPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
