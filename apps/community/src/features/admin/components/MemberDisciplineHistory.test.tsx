// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockUseQuery = vi.fn();
const mockT = vi.fn((key: string, params?: Record<string, unknown>) => {
  if (params) return `${key}:${JSON.stringify(params)}`;
  return key;
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => mockT,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("./LiftSuspensionDialog", () => ({
  LiftSuspensionDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="lift-dialog">
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

import { MemberDisciplineHistory } from "./MemberDisciplineHistory";

const USER_ID = "00000000-0000-4000-8000-000000000001";

const MOCK_HISTORY = [
  {
    id: "disc-1",
    userId: USER_ID,
    actionType: "warning",
    reason: "Spam",
    notes: null,
    status: "active",
    suspensionEndsAt: null,
    issuedBy: "admin-1",
    issuedByName: "Admin One",
    liftedAt: null,
    liftedBy: null,
    liftedByName: null,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "disc-2",
    userId: USER_ID,
    actionType: "suspension",
    reason: "Harassment",
    notes: null,
    status: "lifted",
    suspensionEndsAt: "2026-02-01T00:00:00Z",
    issuedBy: "admin-1",
    issuedByName: "Admin One",
    liftedAt: "2026-01-15T00:00:00Z",
    liftedBy: "admin-2",
    liftedByName: "Admin Two",
    createdAt: "2026-01-10T00:00:00Z",
  },
];

const MOCK_SUSPENSION = {
  id: "disc-3",
  userId: USER_ID,
  actionType: "suspension",
  reason: "Repeated violations",
  notes: null,
  status: "active",
  suspensionEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  issuedBy: "admin-1",
  issuedByName: "Admin One",
  liftedAt: null,
  liftedBy: null,
  liftedByName: null,
  createdAt: "2026-03-01T00:00:00Z",
};

const MOCK_RESPONSE = {
  data: {
    user: {
      id: USER_ID,
      name: "Test User",
      displayName: "TestDisplay",
      email: "test@example.com",
      accountStatus: "SUSPENDED",
    },
    disciplineHistory: MOCK_HISTORY,
    activeSuspension: MOCK_SUSPENSION,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseQuery.mockReturnValue({
    data: MOCK_RESPONSE,
    isLoading: false,
    error: null,
  });
});

describe("MemberDisciplineHistory", () => {
  it("renders loading state", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });
    render(<MemberDisciplineHistory userId={USER_ID} />);
    expect(screen.getByLabelText("loading")).toBeTruthy();
  });

  it("renders member name and account status badge", () => {
    render(<MemberDisciplineHistory userId={USER_ID} />);
    expect(screen.getByText("TestDisplay")).toBeTruthy();
    expect(screen.getByTestId("account-status-badge")).toBeTruthy();
  });

  it("renders active suspension banner with lift button", () => {
    render(<MemberDisciplineHistory userId={USER_ID} />);
    expect(screen.getByTestId("active-suspension-banner")).toBeTruthy();
    expect(screen.getByTestId("lift-suspension-btn")).toBeTruthy();
  });

  it("renders discipline timeline with all action types", () => {
    render(<MemberDisciplineHistory userId={USER_ID} />);
    expect(screen.getByTestId("discipline-action-disc-1")).toBeTruthy();
    expect(screen.getByTestId("discipline-action-disc-2")).toBeTruthy();
  });

  it("shows lifted info for lifted actions", () => {
    render(<MemberDisciplineHistory userId={USER_ID} />);
    // The lifted action should show liftedByName
    const liftedAction = screen.getByTestId("discipline-action-disc-2");
    expect(liftedAction.textContent).toContain("Admin Two");
  });

  it("opens lift dialog when lift button is clicked", () => {
    render(<MemberDisciplineHistory userId={USER_ID} />);
    fireEvent.click(screen.getByTestId("lift-suspension-btn"));
    expect(screen.getByTestId("lift-dialog")).toBeTruthy();
  });

  it("does not show suspension banner when no active suspension", () => {
    mockUseQuery.mockReturnValue({
      data: {
        data: {
          ...MOCK_RESPONSE.data,
          activeSuspension: null,
        },
      },
      isLoading: false,
      error: null,
    });
    render(<MemberDisciplineHistory userId={USER_ID} />);
    expect(screen.queryByTestId("active-suspension-banner")).toBeNull();
  });

  it("shows empty state when no discipline history", () => {
    mockUseQuery.mockReturnValue({
      data: {
        data: {
          ...MOCK_RESPONSE.data,
          disciplineHistory: [],
          activeSuspension: null,
        },
      },
      isLoading: false,
      error: null,
    });
    render(<MemberDisciplineHistory userId={USER_ID} />);
    expect(mockT).toHaveBeenCalledWith("discipline.noHistory");
  });

  it("renders back to queue link", () => {
    render(<MemberDisciplineHistory userId={USER_ID} />);
    const backLink = document.querySelector("a[href='/admin/moderation']");
    expect(backLink).not.toBeNull();
  });
});
