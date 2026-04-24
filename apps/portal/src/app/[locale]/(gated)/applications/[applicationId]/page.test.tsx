import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-applications", () => ({
  getApplicationDetailForSeeker: vi.fn(),
  getTransitionHistory: vi.fn(),
}));
vi.mock("@/services/conversation-service", () => ({
  getConversationStatus: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockImplementation((ns: string) =>
    Promise.resolve((key: string, params?: Record<string, string>) => {
      const full = `${ns}.${key}`;
      if (params) return `${full}:${JSON.stringify(params)}`;
      return full;
    }),
  ),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/domain/application-status-badge", () => ({
  ApplicationStatusBadge: ({ status }: { status: string }) => (
    <span data-testid={`status-badge-${status}`}>{status}</span>
  ),
}));
vi.mock("@/components/domain/application-timeline", () => ({
  ApplicationTimeline: ({ transitions }: { transitions: unknown[] }) => (
    <div data-testid="application-timeline" data-count={transitions.length} />
  ),
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));
vi.mock("@/components/ui/separator", () => ({
  Separator: ({ className }: { className?: string }) => <hr className={className} />,
}));
vi.mock("@/components/domain/withdraw-application-controls", () => ({
  WithdrawApplicationControls: ({
    applicationId,
    currentStatus,
  }: {
    applicationId: string;
    jobTitle: string;
    currentStatus: string;
  }) => (
    <button data-testid={`withdraw-controls-${applicationId}`} data-status={currentStatus}>
      Withdraw
    </button>
  ),
}));
vi.mock("@/components/domain/application-messaging-section", () => ({
  ApplicationMessagingSection: ({
    applicationId,
    conversationExists,
    unreadCount,
  }: {
    applicationId: string;
    conversationExists: boolean;
    readOnly: boolean;
    otherPartyName: string;
    unreadCount: number;
  }) => (
    <div
      data-testid="application-messaging-section"
      data-application-id={applicationId}
      data-conversation-exists={conversationExists ? "true" : "false"}
      data-unread-count={unreadCount}
    />
  ),
}));

import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { auth } from "@igbo/auth";
import {
  getApplicationDetailForSeeker,
  getTransitionHistory,
} from "@igbo/db/queries/portal-applications";
import { getConversationStatus } from "@/services/conversation-service";
import ApplicationDetailPage from "./page";

expect.extend(toHaveNoViolations);

const seekerSession = {
  user: { id: "seeker-1", activePortalRole: "JOB_SEEKER" },
};

const mockApplication = {
  id: "app-1",
  jobId: "jp-1",
  seekerUserId: "seeker-1",
  status: "submitted" as const,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  coverLetterText: "I am a great fit.",
  portfolioLinksJson: ["https://example.com"],
  selectedCvId: "cv-1",
  jobTitle: "Senior Engineer",
  companyId: "cp-1",
  companyName: "Acme Corp",
  cvLabel: "Main CV",
};

const mockTransitions = [
  {
    id: "tr-1",
    applicationId: "app-1",
    fromStatus: "submitted",
    toStatus: "submitted",
    actorUserId: "seeker-1",
    actorRole: "job_seeker",
    reason: null,
    createdAt: new Date("2026-01-01"),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
  vi.mocked(getApplicationDetailForSeeker).mockResolvedValue(mockApplication as never);
  vi.mocked(getTransitionHistory).mockResolvedValue(mockTransitions as never);
  vi.mocked(getConversationStatus).mockResolvedValue({
    exists: false,
    readOnly: false,
    unreadCount: 0,
  });
});

async function renderPage(locale = "en", applicationId = "app-1") {
  const node = await ApplicationDetailPage({
    params: Promise.resolve({ locale, applicationId }),
  });
  return render(node as React.ReactElement);
}

describe("ApplicationDetailPage", () => {
  it("renders application detail with job title and company", async () => {
    await renderPage();
    expect(screen.getByText("Senior Engineer")).toBeTruthy();
    expect(screen.getByText("Acme Corp")).toBeTruthy();
  });

  it("renders the cover letter text", async () => {
    await renderPage();
    expect(screen.getByText("I am a great fit.")).toBeTruthy();
  });

  it("renders the CV label", async () => {
    await renderPage();
    expect(screen.getByText("Main CV")).toBeTruthy();
  });

  it("renders the timeline", async () => {
    await renderPage();
    expect(screen.getByTestId("application-timeline")).toBeTruthy();
  });

  it("renders 'no cover letter' when coverLetterText is null", async () => {
    vi.mocked(getApplicationDetailForSeeker).mockResolvedValue({
      ...mockApplication,
      coverLetterText: null,
    } as never);
    await renderPage();
    expect(screen.getByText("Portal.applications.noCoverLetter")).toBeTruthy();
  });

  it("redirects to locale root if not JOB_SEEKER", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "employer-1", activePortalRole: "EMPLOYER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("redirects if unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("redirects to applications list if application not found", async () => {
    vi.mocked(getApplicationDetailForSeeker).mockResolvedValue(null);
    await expect(renderPage("en", "app-999")).rejects.toThrow("REDIRECT:/en/applications");
  });

  it("renders portfolio links", async () => {
    await renderPage();
    expect(screen.getByText("https://example.com")).toBeTruthy();
  });

  it("calls getApplicationDetailForSeeker with correct args", async () => {
    await renderPage();
    expect(getApplicationDetailForSeeker).toHaveBeenCalledWith("app-1", "seeker-1");
  });

  it("does not show CV section when no CV was selected", async () => {
    vi.mocked(getApplicationDetailForSeeker).mockResolvedValue({
      ...mockApplication,
      selectedCvId: null,
      cvLabel: null,
    } as never);
    await renderPage();
    expect(screen.queryByText("Portal.applications.selectedCvHeading")).toBeNull();
  });

  it("passes axe-core accessibility assertion", async () => {
    const { container } = await renderPage();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders WithdrawApplicationControls for a withdrawable (submitted) application", async () => {
    vi.mocked(getApplicationDetailForSeeker).mockResolvedValue({
      ...mockApplication,
      status: "submitted",
    } as never);
    await renderPage();
    expect(screen.getByTestId("withdraw-controls-app-1")).toBeTruthy();
  });

  it("renders WithdrawApplicationControls for offered status (also withdrawable)", async () => {
    vi.mocked(getApplicationDetailForSeeker).mockResolvedValue({
      ...mockApplication,
      status: "offered",
    } as never);
    await renderPage();
    expect(screen.getByTestId("withdraw-controls-app-1")).toBeTruthy();
  });

  it("does NOT render WithdrawApplicationControls for terminal status (withdrawn)", async () => {
    vi.mocked(getApplicationDetailForSeeker).mockResolvedValue({
      ...mockApplication,
      status: "withdrawn",
    } as never);
    await renderPage();
    expect(screen.queryByTestId("withdraw-controls-app-1")).toBeNull();
  });

  it("does NOT render WithdrawApplicationControls for terminal status (hired)", async () => {
    vi.mocked(getApplicationDetailForSeeker).mockResolvedValue({
      ...mockApplication,
      status: "hired",
    } as never);
    await renderPage();
    expect(screen.queryByTestId("withdraw-controls-app-1")).toBeNull();
  });

  it("does NOT render WithdrawApplicationControls for terminal status (rejected)", async () => {
    vi.mocked(getApplicationDetailForSeeker).mockResolvedValue({
      ...mockApplication,
      status: "rejected",
    } as never);
    await renderPage();
    expect(screen.queryByTestId("withdraw-controls-app-1")).toBeNull();
  });

  it("passes axe-core check with terminal-state application (no withdraw button)", async () => {
    vi.mocked(getApplicationDetailForSeeker).mockResolvedValue({
      ...mockApplication,
      status: "withdrawn",
    } as never);
    const { container } = await renderPage();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders ApplicationMessagingSection with conversationExists=false when no conversation", async () => {
    vi.mocked(getConversationStatus).mockResolvedValue({
      exists: false,
      readOnly: false,
      unreadCount: 0,
    });
    await renderPage();
    const section = screen.getByTestId("application-messaging-section");
    expect(section).toHaveAttribute("data-conversation-exists", "false");
  });

  it("renders ApplicationMessagingSection with conversationExists=true and unreadCount from SSR", async () => {
    vi.mocked(getConversationStatus).mockResolvedValue({
      exists: true,
      readOnly: false,
      unreadCount: 3,
    });
    await renderPage();
    const section = screen.getByTestId("application-messaging-section");
    expect(section).toHaveAttribute("data-conversation-exists", "true");
    expect(section).toHaveAttribute("data-unread-count", "3");
  });

  it("renders ApplicationMessagingSection with applicationId", async () => {
    await renderPage();
    const section = screen.getByTestId("application-messaging-section");
    expect(section).toHaveAttribute("data-application-id", "app-1");
  });

  it("renders ApplicationMessagingSection even when getConversationStatus throws", async () => {
    vi.mocked(getConversationStatus).mockRejectedValue(new Error("DB error"));
    // Should not throw — .catch() fallback used
    await expect(renderPage()).resolves.toBeDefined();
    const section = screen.getByTestId("application-messaging-section");
    expect(section).toHaveAttribute("data-conversation-exists", "false");
  });
});
