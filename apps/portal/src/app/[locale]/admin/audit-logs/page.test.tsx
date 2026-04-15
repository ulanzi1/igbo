import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-admin-audit-logs", () => ({
  listPortalAdminAuditLogs: vi.fn(),
  getDistinctPortalAuditAdmins: vi.fn(),
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
vi.mock("@/components/domain/audit-log-table", () => ({
  AuditLogTable: ({
    initialLogs,
    initialTotal,
    admins,
  }: {
    initialLogs: unknown[];
    initialTotal: number;
    admins: unknown[];
  }) => (
    <div
      data-testid="audit-log-table"
      data-total={initialTotal}
      data-logs={initialLogs.length}
      data-admins={admins.length}
    />
  ),
}));

import React from "react";
import { auth } from "@igbo/auth";
import {
  listPortalAdminAuditLogs,
  getDistinctPortalAuditAdmins,
} from "@igbo/db/queries/portal-admin-audit-logs";
import Page from "./page";

const adminSession = { user: { id: "admin-1", activePortalRole: "JOB_ADMIN" } };

const mockPaginatedLogs = {
  logs: [
    {
      id: "log-1",
      actorId: "admin-1",
      actorName: "Admin",
      action: "portal.posting.approve",
      targetUserId: null,
      targetType: "portal_job_posting",
      traceId: null,
      details: {},
      createdAt: new Date(),
    },
  ],
  total: 1,
  page: 1,
  limit: 50,
  totalPages: 1,
};

const mockAdmins = [{ id: "admin-1", name: "Admin" }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPortalAdminAuditLogs).mockResolvedValue(mockPaginatedLogs as never);
  vi.mocked(getDistinctPortalAuditAdmins).mockResolvedValue(mockAdmins);
});

async function renderPage() {
  const node = await Page({ params: Promise.resolve({ locale: "en" }) });
  return render(node as React.ReactElement);
}

describe("AdminAuditLogsPage", () => {
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

  it("renders audit log table for JOB_ADMIN", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    await renderPage();
    expect(screen.getByTestId("audit-log-table")).toBeTruthy();
  });

  it("calls both query functions with correct params", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    await renderPage();
    expect(listPortalAdminAuditLogs).toHaveBeenCalledWith(1, 50);
    expect(getDistinctPortalAuditAdmins).toHaveBeenCalled();
  });
});
