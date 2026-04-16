import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { fireEvent, waitFor } from "@testing-library/react";
import { renderWithPortalProviders, screen } from "@/test-utils/render";

expect.extend(toHaveNoViolations);

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";
import { ReportInvestigationDetail } from "./report-investigation-detail";

global.fetch = vi.fn();

const OPEN_REPORT = {
  id: "report-1",
  postingId: "posting-1",
  reporterUserId: "user-1",
  category: "scam_fraud" as const,
  description: "This posting looks like a scam with unrealistic claims.",
  status: "open" as const,
  resolutionAction: null,
  resolvedAt: null,
  resolvedByUserId: null,
  resolutionNote: null,
  createdAt: new Date("2026-04-10"),
};

const BASE_PROPS = {
  postingId: "posting-1",
  postingTitle: "Software Engineer",
  reports: [OPEN_REPORT],
};

const LONG_NOTE =
  "This posting was reviewed and no violations were found after thorough investigation.";

beforeEach(() => {
  vi.clearAllMocks();
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ dismissedCount: 1 }),
  });
});

describe("ReportInvestigationDetail", () => {
  it("renders posting title", () => {
    renderWithPortalProviders(<ReportInvestigationDetail {...BASE_PROPS} />);
    expect(screen.getByTestId("report-detail-title").textContent).toBe("Software Engineer");
  });

  it("renders reports list", () => {
    renderWithPortalProviders(<ReportInvestigationDetail {...BASE_PROPS} />);
    expect(screen.getByTestId("reports-list")).toBeDefined();
    expect(screen.getByTestId(`report-item-${OPEN_REPORT.id}`)).toBeDefined();
  });

  it("shows empty state when no reports", () => {
    renderWithPortalProviders(<ReportInvestigationDetail {...BASE_PROPS} reports={[]} />);
    expect(screen.getByTestId("no-reports-message")).toBeDefined();
  });

  it("shows resolution panel for active reports", () => {
    renderWithPortalProviders(<ReportInvestigationDetail {...BASE_PROPS} />);
    expect(screen.getByTestId("resolution-panel")).toBeDefined();
  });

  it("does not show resolution panel for resolved reports only", () => {
    const resolved = { ...OPEN_REPORT, status: "resolved" as const };
    renderWithPortalProviders(<ReportInvestigationDetail {...BASE_PROPS} reports={[resolved]} />);
    expect(screen.queryByTestId("resolution-panel")).toBeNull();
  });

  it("dismiss button is disabled when note is too short", () => {
    renderWithPortalProviders(<ReportInvestigationDetail {...BASE_PROPS} />);
    const btn = screen.getByTestId("dismiss-reports-button");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("dismiss button enables when note >= 20 chars", () => {
    renderWithPortalProviders(<ReportInvestigationDetail {...BASE_PROPS} />);
    fireEvent.change(screen.getByTestId("resolution-note-textarea"), {
      target: { value: LONG_NOTE },
    });
    const btn = screen.getByTestId("dismiss-reports-button");
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("calls dismiss API and shows success toast", async () => {
    renderWithPortalProviders(<ReportInvestigationDetail {...BASE_PROPS} />);
    fireEvent.change(screen.getByTestId("resolution-note-textarea"), {
      target: { value: LONG_NOTE },
    });
    fireEvent.click(screen.getByTestId("dismiss-reports-button"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/admin/reports/postings/posting-1/dismiss",
        expect.objectContaining({ method: "POST" }),
      );
      expect(toast.success).toHaveBeenCalled();
    });
  });

  it("calls resolve API and shows success toast", async () => {
    renderWithPortalProviders(<ReportInvestigationDetail {...BASE_PROPS} />);
    fireEvent.change(screen.getByTestId("resolution-note-textarea"), {
      target: { value: LONG_NOTE },
    });
    fireEvent.click(screen.getByTestId("resolve-reports-button"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/admin/reports/postings/posting-1/resolve",
        expect.objectContaining({ method: "POST" }),
      );
      expect(toast.success).toHaveBeenCalled();
    });
  });

  it("shows error toast on failed request", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    renderWithPortalProviders(<ReportInvestigationDetail {...BASE_PROPS} />);
    fireEvent.change(screen.getByTestId("resolution-note-textarea"), {
      target: { value: LONG_NOTE },
    });
    fireEvent.click(screen.getByTestId("dismiss-reports-button"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithPortalProviders(<ReportInvestigationDetail {...BASE_PROPS} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
