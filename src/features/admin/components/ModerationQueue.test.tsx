// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
const mockUseQueryClient = vi.fn();
const mockInvalidateQueries = vi.fn();
const mockMutate = vi.fn();
const mockT = vi.fn((key: string) => key);

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

const VALID_UUID = "00000000-0000-4000-8000-000000000001";

const MOCK_ITEMS = [
  {
    id: "action-1",
    contentType: "post",
    contentId: "post-001",
    contentPreview: "This is bad content with badword here",
    authorName: "Alice",
    contentAuthorId: VALID_UUID,
    flagReason: "hate_speech",
    keywordMatched: "badword",
    autoFlagged: true,
    flaggedAt: "2026-01-01T00:00:00Z",
    status: "pending",
    visibilityOverride: "visible",
    disciplineLinked: false,
    disciplineCount: 2,
    reportCount: 1,
    reporterId: "reporter-001",
    reporterName: "Bob",
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
    expect(mockUseQuery).toHaveBeenCalled();
  });

  it("shows outcome tag 'approved' for reviewed item with visible override and no discipline", () => {
    mockUseQuery.mockReturnValue({
      data: {
        data: {
          items: [
            {
              ...MOCK_ITEMS[0],
              id: "reviewed-1",
              status: "reviewed",
              visibilityOverride: "visible",
              disciplineLinked: false,
            },
          ],
        },
        meta: { page: 1, pageSize: 20, total: 1 },
      },
      isLoading: false,
    });
    render(<ModerationQueue />);
    const tag = document.querySelector("[data-testid='outcome-tag-reviewed-1']");
    expect(tag?.textContent).toBe("moderation.outcomeTag.approved");
    expect(screen.queryByLabelText("moderation.action.approve")).toBeNull();
  });

  it("shows outcome tag 'removed' for reviewed item with hidden override", () => {
    mockUseQuery.mockReturnValue({
      data: {
        data: {
          items: [
            {
              ...MOCK_ITEMS[0],
              id: "reviewed-2",
              status: "reviewed",
              visibilityOverride: "hidden",
              disciplineLinked: false,
            },
          ],
        },
        meta: { page: 1, pageSize: 20, total: 1 },
      },
      isLoading: false,
    });
    render(<ModerationQueue />);
    const tag = document.querySelector("[data-testid='outcome-tag-reviewed-2']");
    expect(tag?.textContent).toBe("moderation.outcomeTag.removed");
  });

  it("shows outcome tag 'warned' for reviewed item with visible override and discipline linked", () => {
    mockUseQuery.mockReturnValue({
      data: {
        data: {
          items: [
            {
              ...MOCK_ITEMS[0],
              id: "reviewed-3",
              status: "reviewed",
              visibilityOverride: "visible",
              disciplineLinked: true,
            },
          ],
        },
        meta: { page: 1, pageSize: 20, total: 1 },
      },
      isLoading: false,
    });
    render(<ModerationQueue />);
    const tag = document.querySelector("[data-testid='outcome-tag-reviewed-3']");
    expect(tag?.textContent).toBe("moderation.outcomeTag.warned");
  });

  it("shows outcome tag 'dismissed' for dismissed item", () => {
    mockUseQuery.mockReturnValue({
      data: {
        data: {
          items: [
            {
              ...MOCK_ITEMS[0],
              id: "dismissed-1",
              status: "dismissed",
              visibilityOverride: "visible",
              disciplineLinked: false,
            },
          ],
        },
        meta: { page: 1, pageSize: 20, total: 1 },
      },
      isLoading: false,
    });
    render(<ModerationQueue />);
    const tag = document.querySelector("[data-testid='outcome-tag-dismissed-1']");
    expect(tag?.textContent).toBe("moderation.outcomeTag.dismissed");
  });

  // ─── View content button (replaces old <a> link) ─────────────────────────

  it("shows 'View content' button when contentPreview is null", () => {
    mockUseQuery.mockReturnValue({
      data: {
        data: {
          items: [
            {
              ...MOCK_ITEMS[0],
              id: "no-preview-1",
              contentPreview: null,
              contentType: "post",
              contentId: "post-999",
            },
          ],
        },
        meta: { page: 1, pageSize: 20, total: 1 },
      },
      isLoading: false,
    });
    render(<ModerationQueue />);
    const btn = document.querySelector("[data-testid='view-content-btn-no-preview-1']");
    expect(btn).not.toBeNull();
    expect(btn?.tagName).toBe("BUTTON");
    expect(btn?.textContent).toBe("moderation.viewContentExpand");
  });

  // ─── Author link + discipline badge ──────────────────────────────────────

  it("renders author name as link to discipline history page", () => {
    render(<ModerationQueue />);
    const link = document.querySelector(`[data-testid='author-link-action-1']`);
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe(`/admin/moderation/members/${VALID_UUID}`);
    expect(link?.textContent).toContain("Alice");
  });

  it("shows discipline badge count on author name when disciplineCount > 0", () => {
    render(<ModerationQueue />);
    const badge = document.querySelector(`[data-testid='discipline-badge-action-1']`);
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe("(2)");
  });

  it("does not show discipline badge when disciplineCount is 0", () => {
    mockUseQuery.mockReturnValue({
      data: {
        data: {
          items: [{ ...MOCK_ITEMS[0], id: "no-disc", disciplineCount: 0 }],
        },
        meta: { page: 1, pageSize: 20, total: 1 },
      },
      isLoading: false,
    });
    render(<ModerationQueue />);
    expect(document.querySelector("[data-testid='discipline-badge-no-disc']")).toBeNull();
  });

  it("renders author as plain text when contentAuthorId is not a valid UUID", () => {
    mockUseQuery.mockReturnValue({
      data: {
        data: {
          items: [
            {
              ...MOCK_ITEMS[0],
              id: "non-uuid-author",
              contentAuthorId: "not-a-uuid",
              authorName: "External",
            },
          ],
        },
        meta: { page: 1, pageSize: 20, total: 1 },
      },
      isLoading: false,
    });
    render(<ModerationQueue />);
    expect(document.querySelector("[data-testid='author-link-non-uuid-author']")).toBeNull();
    expect(screen.getByText("External")).toBeTruthy();
  });

  // ─── Reporter ─────────────────────────────────────────────────────────────

  it("shows reporter name as link when reporterName is provided", () => {
    render(<ModerationQueue />);
    const link = document.querySelector("[data-testid='reporter-link-action-1']");
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe("Bob");
    expect(link?.getAttribute("href")).toBe("/admin/members?userId=reporter-001");
  });

  it("shows '—' when reporterName is null (auto-flagged, no reporter)", () => {
    mockUseQuery.mockReturnValue({
      data: {
        data: {
          items: [
            {
              ...MOCK_ITEMS[0],
              id: "auto-flagged-1",
              reporterName: null,
              reporterId: null,
              reportCount: 0,
            },
          ],
        },
        meta: { page: 1, pageSize: 20, total: 1 },
      },
      isLoading: false,
    });
    render(<ModerationQueue />);
    expect(document.querySelector("[data-testid='reporter-link-auto-flagged-1']")).toBeNull();
  });
});
