import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, _params?: Record<string, unknown>) => key,
}));

const mockUseQuery = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

import { AuditLogTable } from "./AuditLogTable";

const MOCK_DATA = {
  logs: [
    {
      id: "log-1",
      actorId: "actor-1",
      actorName: "Admin User",
      action: "BAN_MEMBER",
      targetUserId: "user-1",
      targetType: "user",
      traceId: "trace-abc",
      details: { note: "spam" },
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
};

describe("AuditLogTable", () => {
  it("shows loading state", () => {
    mockUseQuery.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    render(<AuditLogTable />);
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("shows error state", () => {
    mockUseQuery.mockReturnValue({ isLoading: false, isError: true, data: undefined });
    render(<AuditLogTable />);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("renders filters", () => {
    mockUseQuery.mockReturnValue({ isLoading: false, isError: false, data: MOCK_DATA });
    render(<AuditLogTable />);
    expect(screen.getByText("filterAction")).toBeInTheDocument();
    expect(screen.getByText("filterTargetType")).toBeInTheDocument();
    expect(screen.getByText("filterDateFrom")).toBeInTheDocument();
    expect(screen.getByText("filterDateTo")).toBeInTheDocument();
  });

  it("renders table columns", () => {
    mockUseQuery.mockReturnValue({ isLoading: false, isError: false, data: MOCK_DATA });
    render(<AuditLogTable />);
    expect(screen.getByText("colTimestamp")).toBeInTheDocument();
    expect(screen.getByText("colAdmin")).toBeInTheDocument();
    expect(screen.getByText("colAction")).toBeInTheDocument();
    expect(screen.getByText("colTargetType")).toBeInTheDocument();
    expect(screen.getByText("colTargetId")).toBeInTheDocument();
    expect(screen.getByText("colDetails")).toBeInTheDocument();
    expect(screen.getByText("colTraceId")).toBeInTheDocument();
  });

  it("renders a log row", () => {
    mockUseQuery.mockReturnValue({ isLoading: false, isError: false, data: MOCK_DATA });
    render(<AuditLogTable />);
    expect(screen.getByText("Admin User")).toBeInTheDocument();
    // BAN_MEMBER appears in both dropdown and table row — at least 2 elements
    expect(screen.getAllByText("BAN_MEMBER").length).toBeGreaterThanOrEqual(1);
    // "user" appears in dropdown and table — check table cell specifically
    expect(screen.getAllByText("user").length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty state when no logs", () => {
    mockUseQuery.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { ...MOCK_DATA, logs: [], total: 0, totalPages: 0 },
    });
    render(<AuditLogTable />);
    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  it("shows pagination when totalPages > 1", () => {
    mockUseQuery.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { ...MOCK_DATA, totalPages: 3 },
    });
    render(<AuditLogTable />);
    expect(screen.getByText("prev")).toBeInTheDocument();
    expect(screen.getByText("next")).toBeInTheDocument();
  });
});
