// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      conversionBannerTitle: "Ready to apply?",
      conversionBannerDescription:
        "Join the OBIGBO community to apply for jobs and track your applications",
      conversionBannerSignIn: "Sign In",
      conversionBannerRegister: "Create Account",
      signInToApply: "Sign in to apply for jobs",
      dismissBanner: "Dismiss",
    };
    return map[key] ?? key;
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild,
    ...props
  }: React.HTMLAttributes<HTMLElement> & { asChild?: boolean }) => {
    if (asChild) {
      // pass-through children as-is when asChild
      return <>{children}</>;
    }
    return (
      <button type="button" {...props}>
        {children}
      </button>
    );
  },
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
}));

import { GuestConversionBanner } from "./guest-conversion-banner";

const PROPS = {
  communityUrl: "https://community.example.com",
  callbackUrl: "https://jobs.example.com/en/jobs/abc123?ref=apply",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Reset sessionStorage between tests
  sessionStorage.clear();
});

describe("GuestConversionBanner", () => {
  it("renders the banner title", () => {
    render(<GuestConversionBanner {...PROPS} />);
    expect(screen.getByText("Ready to apply?")).toBeInTheDocument();
  });

  it("renders the banner description", () => {
    render(<GuestConversionBanner {...PROPS} />);
    expect(
      screen.getByText("Join the OBIGBO community to apply for jobs and track your applications"),
    ).toBeInTheDocument();
  });

  it("sign-in link points to community login with callbackUrl", () => {
    render(<GuestConversionBanner {...PROPS} />);
    const signInLink = screen.getByRole("link", { name: "Sign In" });
    const expected = `https://community.example.com/login?callbackUrl=${encodeURIComponent(PROPS.callbackUrl)}`;
    expect(signInLink).toHaveAttribute("href", expected);
  });

  it("create-account link points to community /join", () => {
    render(<GuestConversionBanner {...PROPS} />);
    const joinLink = screen.getByRole("link", { name: "Create Account" });
    expect(joinLink).toHaveAttribute("href", "https://community.example.com/join");
  });

  it("dismiss button hides the banner", async () => {
    const user = userEvent.setup();
    render(<GuestConversionBanner {...PROPS} />);
    expect(screen.getByText("Ready to apply?")).toBeInTheDocument();
    await user.click(screen.getByTestId("dismiss-banner"));
    expect(screen.queryByText("Ready to apply?")).not.toBeInTheDocument();
  });

  it("dismissed state is persisted in sessionStorage (re-render doesn't show banner)", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<GuestConversionBanner {...PROPS} />);
    await user.click(screen.getByTestId("dismiss-banner"));
    unmount();
    // Re-render — sessionStorage still has the dismissed flag
    render(<GuestConversionBanner {...PROPS} />);
    expect(screen.queryByText("Ready to apply?")).not.toBeInTheDocument();
  });

  it("dismiss button aria-label uses i18n key (not hardcoded)", () => {
    render(<GuestConversionBanner {...PROPS} />);
    const dismissBtn = screen.getByTestId("dismiss-banner");
    expect(dismissBtn).toHaveAttribute("aria-label", "Dismiss");
  });

  it("passes axe accessibility check", async () => {
    const { container } = render(<GuestConversionBanner {...PROPS} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
