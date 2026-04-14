import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-employer-verifications", () => ({
  listPendingVerifications: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/components/domain/verification-queue-table", () => ({
  VerificationQueueTable: ({ items }: { items: unknown[] }) => (
    <div data-testid="queue-table" data-count={items.length} />
  ),
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import React from "react";
import { auth } from "@igbo/auth";
import { listPendingVerifications } from "@igbo/db/queries/portal-employer-verifications";
import Page from "./page";

const adminSession = { user: { id: "admin-1", activePortalRole: "JOB_ADMIN" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPendingVerifications).mockResolvedValue({ items: [], total: 0 });
});

async function renderPage() {
  const node = await Page({ params: Promise.resolve({ locale: "en" }) });
  return render(node as React.ReactElement);
}

describe("AdminVerificationsPage", () => {
  it("redirects non-admin users", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", activePortalRole: "EMPLOYER" },
    } as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("redirects unauthenticated users", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("renders verification queue table for admin", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    await renderPage();
    expect(screen.getByTestId("queue-table")).toBeTruthy();
  });

  it("passes items from listPendingVerifications to table", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    vi.mocked(listPendingVerifications).mockResolvedValue({
      items: [{ id: "ver-1" } as never],
      total: 1,
    });
    await renderPage();
    expect(screen.getByTestId("queue-table").getAttribute("data-count")).toBe("1");
  });
});
