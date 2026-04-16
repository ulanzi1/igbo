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
  Link: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [k: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { VerificationQueueTable } from "./verification-queue-table";
import type { VerificationQueueItem } from "@igbo/db/queries/portal-employer-verifications";

const mockItem: VerificationQueueItem = {
  id: "ver-1",
  companyId: "company-1",
  companyName: "ACME Ltd",
  ownerUserName: "John Doe",
  ownerUserId: "user-1",
  documentCount: 2,
  submittedAt: new Date("2026-04-01T00:00:00Z"),
  status: "pending",
};

describe("VerificationQueueTable", () => {
  it("shows empty message when no items", () => {
    render(<VerificationQueueTable items={[]} />);
    expect(screen.getByTestId("empty-queue")).toBeTruthy();
    expect(screen.queryByTestId("queue-row")).toBeNull();
  });

  it("renders a row for each item", () => {
    render(<VerificationQueueTable items={[mockItem]} />);
    expect(screen.getAllByTestId("queue-row")).toHaveLength(1);
    expect(screen.getByText("ACME Ltd")).toBeTruthy();
    expect(screen.getByText("John Doe")).toBeTruthy();
  });

  it("renders pending status badge", () => {
    render(<VerificationQueueTable items={[mockItem]} />);
    expect(screen.getByTestId("status-badge").textContent).toContain("verificationsPending");
  });

  it("renders approved status badge", () => {
    render(<VerificationQueueTable items={[{ ...mockItem, status: "approved" }]} />);
    expect(screen.getByTestId("status-badge").textContent).toContain("verificationsApproved");
  });

  it("renders rejected status badge", () => {
    render(<VerificationQueueTable items={[{ ...mockItem, status: "rejected" }]} />);
    expect(screen.getByTestId("status-badge").textContent).toContain("verificationsRejected");
  });

  it("review link has correct aria-label", () => {
    render(<VerificationQueueTable items={[mockItem]} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("aria-label")).toContain("ACME Ltd");
    expect(link.getAttribute("href")).toContain("ver-1");
  });

  it("renders document count", () => {
    render(<VerificationQueueTable items={[mockItem]} />);
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(<VerificationQueueTable items={[mockItem]} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
