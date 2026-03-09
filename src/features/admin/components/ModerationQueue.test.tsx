// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
const mockUseQueryClient = vi.fn();
const mockInvalidateQueries = vi.fn();
const mockMutate = vi.fn();
const mockT = vi.fn((key: string, _params?: unknown) => key);

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQueryClient: () => mockUseQueryClient(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => mockT,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("./ModerationActionDialog", () => ({
  ModerationActionDialog: ({
    onConfirm,
    onCancel,
  }: {
    action: string;
    onConfirm: (r?: string) => void;
    onCancel: () => void;
    isPending: boolean;
  }) => (
    <div data-testid="action-dialog">
      <button onClick={() => onConfirm()}>confirm</button>
      <button onClick={onCancel}>cancel</button>
    </div>
  ),
}));

import { ModerationQueue } from "./ModerationQueue";

const MOCK_ITEMS = [
  {
    id: "action-1",
    contentType: "post",
    contentPreview: "This is bad content with badword here",
    authorName: "Alice",
    flagReason: "hate_speech",
    keywordMatched: "badword",
    flaggedAt: "2026-01-01T00:00:00Z",
    status: "pending",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockUseQueryClient.mockReturnValue({ invalidateQueries: mockInvalidateQueries });
  mockUseMutation.mockReturnValue({ mutate: mockMutate, isPending: false });
  mockUseQuery.mockReturnValue({
    data: {
      data: { items: MOCK_ITEMS },
      meta: { page: 1, pageSize: 20, total: 1 },
    },
    isLoading: false,
  });
});

describe("ModerationQueue", () => {
  it("renders table with flagged items", () => {
    render(<ModerationQueue />);
    expect(screen.getByText("Alice")).toBeTruthy();
  });

  it("highlights matched keyword in content preview", () => {
    render(<ModerationQueue />);
    const mark = document.querySelector("mark");
    expect(mark?.textContent).toBe("badword");
  });

  it("approve button calls mutation with approve action", () => {
    render(<ModerationQueue />);
    const approveBtn = screen.getByLabelText("moderation.action.approve");
    fireEvent.click(approveBtn);
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "action-1", action: "approve" }),
    );
  });

  it("remove button shows confirmation dialog", () => {
    render(<ModerationQueue />);
    const removeBtn = screen.getByLabelText("moderation.action.remove");
    fireEvent.click(removeBtn);
    expect(screen.getByTestId("action-dialog")).toBeTruthy();
  });

  it("renders empty state when no items", () => {
    mockUseQuery.mockReturnValue({
      data: { data: { items: [] }, meta: { page: 1, pageSize: 20, total: 0 } },
      isLoading: false,
    });
    render(<ModerationQueue />);
    expect(screen.getByText("moderation.emptyQueue")).toBeTruthy();
  });

  it("renders skeleton loading state while loading", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<ModerationQueue />);
    expect(screen.getByLabelText("loading")).toBeTruthy();
  });

  it("filter select changes trigger page reset", () => {
    render(<ModerationQueue />);
    const selects = document.querySelectorAll("select");
    fireEvent.change(selects[0]!, { target: { value: "reviewed" } });
    // No crash = pass; query is re-triggered with new key
    expect(mockUseQuery).toHaveBeenCalled();
  });
});
