import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({
    dateTime: (d: Date, _opts?: object) => d.toISOString().slice(0, 10),
  }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { VerificationStatusSection } from "./verification-status-section";
import type { VerificationDisplayStatus } from "./verification-status-section";

describe("VerificationStatusSection", () => {
  it("renders unverified status", () => {
    render(<VerificationStatusSection status="unverified" />);
    const badge = screen.getByTestId("verification-status-badge");
    expect(badge.textContent).toContain("statusUnverified");
  });

  it("renders pending status", () => {
    const status: VerificationDisplayStatus = "pending";
    render(<VerificationStatusSection status={status} submittedAt={new Date("2026-04-01")} />);
    const badge = screen.getByTestId("verification-status-badge");
    expect(badge.textContent).toContain("statusPending");
  });

  it("renders verified status", () => {
    const status: VerificationDisplayStatus = "verified";
    render(<VerificationStatusSection status={status} reviewedAt={new Date("2026-04-02")} />);
    const badge = screen.getByTestId("verification-status-badge");
    expect(badge.textContent).toContain("statusVerified");
  });

  it("renders rejected status with admin notes", () => {
    render(
      <VerificationStatusSection
        status="rejected"
        adminNotes="Documents were invalid."
        reviewedAt={new Date("2026-04-02")}
      />,
    );
    expect(screen.getByTestId("rejection-reason").textContent).toContain("Documents were invalid.");
  });

  it("shows request verification button when unverified", () => {
    render(<VerificationStatusSection status="unverified" />);
    expect(screen.getByRole("link", { name: "requestVerification" })).toBeTruthy();
  });

  it("shows resubmit button when rejected", () => {
    render(<VerificationStatusSection status="rejected" />);
    expect(screen.getByRole("link", { name: "resubmit" })).toBeTruthy();
  });

  it("shows view details link when pending", () => {
    render(<VerificationStatusSection status="pending" />);
    expect(screen.getByRole("link", { name: "viewDetails" })).toBeTruthy();
  });

  it("shows no CTA button when verified", () => {
    render(<VerificationStatusSection status="verified" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows submitted date when provided", () => {
    render(<VerificationStatusSection status="pending" submittedAt={new Date("2026-04-01")} />);
    expect(screen.getByText(/submittedAt/)).toBeTruthy();
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(<VerificationStatusSection status="unverified" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
