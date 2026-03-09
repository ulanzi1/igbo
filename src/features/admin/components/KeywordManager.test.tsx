// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
const mockUseQueryClient = vi.fn();
const mockInvalidateQueries = vi.fn();
const mockAddMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockT = vi.fn((key: string, params?: { count?: number }) =>
  params ? `${key}:${JSON.stringify(params)}` : key,
);

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQueryClient: () => mockUseQueryClient(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => mockT,
}));

const MOCK_KEYWORDS = [
  {
    id: "kw-1",
    keyword: "badword",
    category: "hate_speech",
    severity: "high",
    notes: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "kw-2",
    keyword: "spam",
    category: "spam",
    severity: "low",
    notes: null,
    isActive: false,
    createdAt: "2026-01-02T00:00:00Z",
  },
];

let mutationCallCount = 0;

beforeEach(() => {
  vi.clearAllMocks();
  mutationCallCount = 0;
  mockUseQueryClient.mockReturnValue({ invalidateQueries: mockInvalidateQueries });
  mockUseQuery.mockReturnValue({
    data: { data: { keywords: MOCK_KEYWORDS } },
  });
  mockUseMutation.mockImplementation(({ mutationFn }: { mutationFn: unknown }) => {
    mutationCallCount++;
    const mutateMap: Record<number, ReturnType<typeof vi.fn>> = {
      1: mockAddMutate,
      2: mockUpdateMutate,
      3: mockDeleteMutate,
    };
    return { mutate: mutateMap[mutationCallCount] ?? vi.fn(), isPending: false };
  });
});

import { KeywordManager } from "./KeywordManager";

describe("KeywordManager", () => {
  it("renders keyword list with all keywords", () => {
    render(<KeywordManager />);
    expect(screen.getByText("badword")).toBeTruthy();
    expect(screen.getAllByText("spam").length).toBeGreaterThan(0);
  });

  it("shows active count in header", () => {
    render(<KeywordManager />);
    // activeCount = 1 (only kw-1 isActive)
    expect(mockT).toHaveBeenCalledWith(
      "moderation.keywords.activeCount",
      expect.objectContaining({ count: 1 }),
    );
  });

  it("opens add dialog when Add Keyword button clicked", () => {
    render(<KeywordManager />);
    const addBtn = screen.getByText("moderation.keywords.addKeyword");
    fireEvent.click(addBtn);
    const dialogs = document.querySelectorAll('[role="dialog"]');
    expect(dialogs.length).toBeGreaterThan(0);
  });

  it("toggle active/inactive button calls update mutation", () => {
    render(<KeywordManager />);
    const activeBtn = screen.getByLabelText("moderation.keywords.active");
    fireEvent.click(activeBtn);
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "kw-1", updates: { isActive: false } }),
    );
  });

  it("delete button calls delete mutation after confirm", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<KeywordManager />);
    const deleteButtons = screen.getAllByLabelText("delete");
    fireEvent.click(deleteButtons[0]!);
    expect(mockDeleteMutate).toHaveBeenCalledWith("kw-1");
  });
});
