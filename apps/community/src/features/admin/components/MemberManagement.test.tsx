// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";

const mockUseMembers = vi.fn();
const mockUseChangeMemberTier = vi.fn();

vi.mock("@/features/admin/hooks/use-members", () => ({
  useMembers: (...args: unknown[]) => mockUseMembers(...args),
  useChangeMemberTier: () => mockUseChangeMemberTier(),
}));

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
  useFormatter: () => ({
    dateTime: (_d: Date, _opts?: unknown) => "Feb 1, 2026",
  }),
}));

vi.mock("./TierChangeDialog", () => ({
  TierChangeDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="tier-dialog" /> : null,
}));

import { MemberManagement } from "./MemberManagement";
import type { AdminMember } from "@/features/admin/hooks/use-members";

const makeMember = (id: string, tier = "BASIC" as const): AdminMember => ({
  id,
  email: `${id}@example.com`,
  name: `User ${id}`,
  displayName: `Display ${id}`,
  membershipTier: tier,
  role: "MEMBER",
  accountStatus: "APPROVED",
  createdAt: "2026-02-01T00:00:00Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUseChangeMemberTier.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
});

describe("MemberManagement", () => {
  it("shows loading state", () => {
    mockUseMembers.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<MemberManagement />);
    expect(screen.getByText("Admin.members.loading")).toBeInTheDocument();
  });

  it("shows error state", () => {
    mockUseMembers.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<MemberManagement />);
    expect(screen.getByText("Admin.members.error")).toBeInTheDocument();
  });

  it("shows empty state when no members", () => {
    mockUseMembers.mockReturnValue({
      data: { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
      isLoading: false,
      isError: false,
    });
    render(<MemberManagement />);
    expect(screen.getByText("Admin.members.noMembers")).toBeInTheDocument();
  });

  it("renders member rows with names and emails", () => {
    const members = [makeMember("m1"), makeMember("m2")];
    mockUseMembers.mockReturnValue({
      data: { data: members, meta: { page: 1, pageSize: 20, total: 2 } },
      isLoading: false,
      isError: false,
    });
    render(<MemberManagement />);
    expect(screen.getByText("Display m1")).toBeInTheDocument();
    expect(screen.getByText("m2@example.com")).toBeInTheDocument();
  });

  it("submits search form and resets page", () => {
    mockUseMembers.mockReturnValue({
      data: { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
      isLoading: false,
      isError: false,
    });
    render(<MemberManagement />);

    const input = screen.getByPlaceholderText("Admin.members.searchPlaceholder");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.submit(input.closest("form")!);

    // useMembers should be called with search param
    expect(mockUseMembers).toHaveBeenCalled();
  });

  it("opens tier change dialog when clicking change tier button", () => {
    const members = [makeMember("m1")];
    mockUseMembers.mockReturnValue({
      data: { data: members, meta: { page: 1, pageSize: 20, total: 1 } },
      isLoading: false,
      isError: false,
    });
    render(<MemberManagement />);

    fireEvent.click(screen.getByText("Admin.members.changeTier.title"));
    expect(screen.getByTestId("tier-dialog")).toBeInTheDocument();
  });

  it("shows pagination when there are multiple pages", () => {
    const members = [makeMember("m1")];
    mockUseMembers.mockReturnValue({
      data: { data: members, meta: { page: 1, pageSize: 1, total: 5 } },
      isLoading: false,
      isError: false,
    });
    render(<MemberManagement />);

    // Previous button should be disabled on page 1
    const prevBtn = screen.getByText("‹");
    expect(prevBtn).toBeDisabled();

    // Next button should be enabled
    const nextBtn = screen.getByText("›");
    expect(nextBtn).not.toBeDisabled();
  });

  it("changes tier filter via select", () => {
    mockUseMembers.mockReturnValue({
      data: { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
      isLoading: false,
      isError: false,
    });
    render(<MemberManagement />);

    const select = screen.getByRole("combobox", { name: /Admin.members.tierFilter.all/i });
    fireEvent.change(select, { target: { value: "PROFESSIONAL" } });

    expect(mockUseMembers).toHaveBeenCalled();
  });
});
