// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";
import { LanguageToggle } from "./LanguageToggle";

const mockReplace = vi.fn();

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

describe("LanguageToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a button", () => {
    render(<LanguageToggle />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("has accessible aria-label from translations", () => {
    render(<LanguageToggle />);
    expect(screen.getByLabelText("Shell.languageToggle")).toBeInTheDocument();
  });

  it("displays the opposite locale code (IG when locale is en)", () => {
    render(<LanguageToggle />);
    expect(screen.getByText("IG")).toBeInTheDocument();
  });

  it("calls router.replace with opposite locale on click", () => {
    render(<LanguageToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockReplace).toHaveBeenCalledWith("/en/home", { locale: "ig" });
  });

  it("has minimum 44px tap target", () => {
    render(<LanguageToggle />);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("min-h-[44px]");
    expect(button).toHaveClass("min-w-[44px]");
  });
});
