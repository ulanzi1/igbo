// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/en/dashboard",
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
}));

import { GettingStartedWidget } from "./GettingStartedWidget";

describe("GettingStartedWidget", () => {
  it("renders the getting started title", () => {
    render(<GettingStartedWidget />);
    expect(screen.getByText("gettingStarted.title")).toBeInTheDocument();
  });

  it("renders the subtitle", () => {
    render(<GettingStartedWidget />);
    expect(screen.getByText("gettingStarted.subtitle")).toBeInTheDocument();
  });

  it("renders 'Join a group' link pointing to /groups", () => {
    render(<GettingStartedWidget />);
    const link = screen.getByText("gettingStarted.joinGroup").closest("a");
    expect(link).toHaveAttribute("href", "/groups");
  });

  it("renders 'Complete your profile' link pointing to /settings/profile", () => {
    render(<GettingStartedWidget />);
    const link = screen.getByText("gettingStarted.completeProfile").closest("a");
    expect(link).toHaveAttribute("href", "/settings/profile");
  });

  it("renders 'Explore members' link pointing to /discover", () => {
    render(<GettingStartedWidget />);
    const link = screen.getByText("gettingStarted.exploreMembers").closest("a");
    expect(link).toHaveAttribute("href", "/discover");
  });

  it("renders all three action description texts", () => {
    render(<GettingStartedWidget />);
    expect(screen.getByText("gettingStarted.joinGroupDesc")).toBeInTheDocument();
    expect(screen.getByText("gettingStarted.completeProfileDesc")).toBeInTheDocument();
    expect(screen.getByText("gettingStarted.exploreMembersDesc")).toBeInTheDocument();
  });

  it("renders title as an h2 element", () => {
    render(<GettingStartedWidget />);
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2).toHaveTextContent("gettingStarted.title");
  });

  it("all three action links are accessible link elements", () => {
    render(<GettingStartedWidget />);
    const links = screen.getAllByRole("link");
    // There should be exactly 3 links
    expect(links).toHaveLength(3);
  });
});
