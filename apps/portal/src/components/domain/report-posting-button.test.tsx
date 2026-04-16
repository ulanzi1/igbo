import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithPortalProviders, screen } from "@/test-utils/render";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock the modal to avoid Radix/Dialog complexity
vi.mock("./report-posting-modal", () => ({
  ReportPostingModal: ({
    open,
    onSuccess,
  }: {
    open: boolean;
    onSuccess: () => void;
    [k: string]: unknown;
  }) =>
    open ? (
      <div data-testid="mock-report-modal">
        <button data-testid="mock-success-btn" onClick={onSuccess}>
          Succeed
        </button>
      </div>
    ) : null,
}));

import { ReportPostingButton } from "./report-posting-button";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReportPostingButton", () => {
  it("renders the report button", () => {
    renderWithPortalProviders(
      <ReportPostingButton postingId="posting-1" postingTitle="Software Engineer" />,
    );
    expect(screen.getByTestId("report-posting-button")).toBeDefined();
  });

  it("opens the modal when clicked", () => {
    renderWithPortalProviders(
      <ReportPostingButton postingId="posting-1" postingTitle="Software Engineer" />,
    );
    expect(screen.queryByTestId("mock-report-modal")).toBeNull();
    fireEvent.click(screen.getByTestId("report-posting-button"));
    expect(screen.getByTestId("mock-report-modal")).toBeDefined();
  });

  it("shows submitted message after success", () => {
    renderWithPortalProviders(
      <ReportPostingButton postingId="posting-1" postingTitle="Software Engineer" />,
    );
    fireEvent.click(screen.getByTestId("report-posting-button"));
    fireEvent.click(screen.getByTestId("mock-success-btn"));
    expect(screen.getByTestId("report-submitted-message")).toBeDefined();
    expect(screen.queryByTestId("report-posting-button")).toBeNull();
  });
});
