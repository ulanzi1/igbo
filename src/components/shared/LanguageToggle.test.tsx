// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";
import { LanguageToggle } from "./LanguageToggle";

const mockReplace = vi.fn();
const mockFetch = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
const mockUseSession = vi.fn(() => ({ data: null }));

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace}.${key}`,
  useLocale: () => "en",
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
  usePathname: () => "/en/home",
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

vi.mock("next-auth/react", () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

const originalFetch = globalThis.fetch;

describe("LanguageToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: null });
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders two segment buttons", () => {
    render(<LanguageToggle />);
    const buttons = screen.getAllByRole("radio");
    expect(buttons).toHaveLength(2);
  });

  it("renders English and Igbo segment labels", () => {
    render(<LanguageToggle />);
    expect(screen.getByText("Shell.language.english")).toBeInTheDocument();
    expect(screen.getByText("Shell.language.igbo")).toBeInTheDocument();
  });

  it("marks the active locale segment as aria-checked true", () => {
    render(<LanguageToggle />);
    const englishButton = screen.getByText("Shell.language.english").closest("button");
    const igboButton = screen.getByText("Shell.language.igbo").closest("button");
    expect(englishButton).toHaveAttribute("aria-checked", "true");
    expect(igboButton).toHaveAttribute("aria-checked", "false");
  });

  it("has accessible radiogroup aria-label", () => {
    render(<LanguageToggle />);
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-label", "Shell.languageToggle");
  });

  it("calls router.replace with target locale when inactive segment clicked", () => {
    render(<LanguageToggle />);
    const igboButton = screen.getByText("Shell.language.igbo").closest("button")!;
    fireEvent.click(igboButton);
    expect(mockReplace).toHaveBeenCalledWith("/en/home", { locale: "ig" });
  });

  it("does not call router.replace when clicking the already-active locale", () => {
    render(<LanguageToggle />);
    const englishButton = screen.getByText("Shell.language.english").closest("button")!;
    fireEvent.click(englishButton);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does not fire fetch for unauthenticated users when toggle clicked", () => {
    mockUseSession.mockReturnValue({ data: null });
    render(<LanguageToggle />);
    const igboButton = screen.getByText("Shell.language.igbo").closest("button")!;
    fireEvent.click(igboButton);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fires fetch to /api/v1/user/language when authenticated user clicks toggle", () => {
    mockUseSession.mockReturnValue({ data: { user: { id: "test-user-id" } } });
    render(<LanguageToggle />);
    const igboButton = screen.getByText("Shell.language.igbo").closest("button")!;
    fireEvent.click(igboButton);
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/user/language", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: "ig" }),
    });
  });

  it("has minimum 44px tap target on the container", () => {
    render(<LanguageToggle />);
    const container = screen.getByRole("radiogroup");
    expect(container).toHaveClass("min-h-[44px]");
  });
});
