import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
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
vi.mock("@/components/messaging/ConversationThread", () => ({
  ConversationThread: ({
    applicationId,
    readOnly,
  }: {
    applicationId: string;
    readOnly: boolean;
  }) => (
    <div
      data-testid="conversation-thread"
      data-application-id={applicationId}
      data-read-only={readOnly ? "true" : "false"}
    />
  ),
}));

import { render, screen } from "@testing-library/react";
import { auth } from "@igbo/auth";
import { getConversationStatus } from "@/services/conversation-service";
import ConversationDetailPage from "./page";

const seekerSession = { user: { id: "seeker-1", activePortalRole: "JOB_SEEKER" } };
const employerSession = { user: { id: "employer-1", activePortalRole: "EMPLOYER" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
  vi.mocked(getConversationStatus).mockResolvedValue({
    exists: true,
    readOnly: false,
    unreadCount: 0,
  });
});

async function renderPage(locale = "en", applicationId = "app-1") {
  const node = await ConversationDetailPage({
    params: Promise.resolve({ locale, applicationId }),
  });
  return render(node as React.ReactElement);
}

describe("ConversationDetailPage", () => {
  it("redirects if unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("redirects admin role to /admin", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-1", activePortalRole: "ADMIN" },
    } as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en/admin");
  });

  it("redirects JOB_SEEKER to application detail when conversation does not exist", async () => {
    vi.mocked(getConversationStatus).mockResolvedValue({
      exists: false,
      readOnly: false,
      unreadCount: 0,
    });
    await expect(renderPage("en", "app-1")).rejects.toThrow("REDIRECT:/en/applications/app-1");
  });

  it("renders ConversationThread for EMPLOYER even when conversation does not exist", async () => {
    vi.mocked(auth).mockResolvedValue(employerSession as never);
    vi.mocked(getConversationStatus).mockResolvedValue({
      exists: false,
      readOnly: false,
      unreadCount: 0,
    });
    await renderPage();
    expect(screen.getByTestId("conversation-thread")).toBeTruthy();
  });

  it("renders ConversationThread with correct applicationId", async () => {
    await renderPage("en", "app-42");
    expect(screen.getByTestId("conversation-thread")).toHaveAttribute(
      "data-application-id",
      "app-42",
    );
  });

  it("passes readOnly=false to ConversationThread", async () => {
    vi.mocked(getConversationStatus).mockResolvedValue({
      exists: true,
      readOnly: false,
      unreadCount: 0,
    });
    await renderPage();
    expect(screen.getByTestId("conversation-thread")).toHaveAttribute("data-read-only", "false");
  });

  it("passes readOnly=true to ConversationThread when conversation is read-only", async () => {
    vi.mocked(getConversationStatus).mockResolvedValue({
      exists: true,
      readOnly: true,
      unreadCount: 0,
    });
    await renderPage();
    expect(screen.getByTestId("conversation-thread")).toHaveAttribute("data-read-only", "true");
  });

  it("renders back link to /conversations", async () => {
    await renderPage();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/conversations");
  });

  it("still renders when getConversationStatus throws (employer — no redirect fallback)", async () => {
    vi.mocked(auth).mockResolvedValue(employerSession as never);
    vi.mocked(getConversationStatus).mockRejectedValue(new Error("DB error"));
    await expect(renderPage()).resolves.toBeDefined();
    expect(screen.getByTestId("conversation-thread")).toBeTruthy();
  });

  it("renders for JOB_SEEKER when conversation exists", async () => {
    await renderPage();
    expect(screen.getByTestId("conversation-thread")).toBeTruthy();
  });

  it("uses locale in redirect URLs", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(renderPage("ig")).rejects.toThrow("REDIRECT:/ig");
  });
});
