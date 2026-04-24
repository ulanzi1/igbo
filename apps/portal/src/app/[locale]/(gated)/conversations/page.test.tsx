import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
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
vi.mock("@/components/messaging/ConversationListView", () => ({
  ConversationListView: () => <div data-testid="conversation-list-view" />,
}));

import { render, screen } from "@testing-library/react";
import { auth } from "@igbo/auth";
import ConversationsPage from "./page";

const seekerSession = {
  user: { id: "seeker-1", activePortalRole: "JOB_SEEKER" },
};

const employerSession = {
  user: { id: "employer-1", activePortalRole: "EMPLOYER" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
});

async function renderPage(locale = "en") {
  const node = await ConversationsPage({ params: Promise.resolve({ locale }) });
  return render(node as React.ReactElement);
}

describe("ConversationsPage", () => {
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

  it("renders ConversationListView for JOB_SEEKER", async () => {
    await renderPage();
    expect(screen.getByTestId("conversation-list-view")).toBeTruthy();
  });

  it("renders ConversationListView for EMPLOYER", async () => {
    vi.mocked(auth).mockResolvedValue(employerSession as never);
    await renderPage();
    expect(screen.getByTestId("conversation-list-view")).toBeTruthy();
  });

  it("renders conversations title heading", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("uses locale in redirect URLs", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(renderPage("ig")).rejects.toThrow("REDIRECT:/ig");
  });
});
