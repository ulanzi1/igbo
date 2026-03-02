// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

const mockUseApplications = vi.fn();

vi.mock("@/features/admin/hooks/use-approvals", () => ({
  useApplications: (...args: unknown[]) => mockUseApplications(...args),
}));

import { QueueSummaryCard } from "./QueueSummaryCard";

describe("QueueSummaryCard", () => {
  it("shows dash while loading", () => {
    mockUseApplications.mockReturnValue({ data: undefined, isPending: true });
    render(<QueueSummaryCard status="PENDING_APPROVAL" label="Pending" colorClass="" />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("shows count when loaded", () => {
    mockUseApplications.mockReturnValue({
      data: { meta: { total: 42 } },
      isPending: false,
    });
    render(<QueueSummaryCard status="PENDING_APPROVAL" label="Pending" colorClass="" />);

    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("passes status to useApplications", () => {
    mockUseApplications.mockReturnValue({ data: undefined, isPending: true });
    render(<QueueSummaryCard status="REJECTED" label="Rejected" colorClass="" />);

    expect(mockUseApplications).toHaveBeenCalledWith("REJECTED");
  });
});
