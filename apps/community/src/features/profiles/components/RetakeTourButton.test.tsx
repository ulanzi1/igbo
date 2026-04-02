// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { RetakeTourButton } from "./RetakeTourButton";

describe("RetakeTourButton", () => {
  it("renders description and link", () => {
    render(<RetakeTourButton />);

    expect(screen.getByText("Settings.profile.retakeTourDescription")).toBeInTheDocument();
    const link = screen.getByText("Settings.profile.retakeTourButton");
    expect(link).toHaveAttribute("href", "/onboarding?step=tour");
  });
});
