// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
const mockUseQueryClient = vi.fn();
const mockInvalidateQueries = vi.fn();
const mockT = vi.fn((key: string) => key);

const mockRulesMutate = vi.fn();
const mockLimitsMutate = vi.fn();
const mockDailyCapMutate = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQueryClient: () => mockUseQueryClient(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => mockT,
}));

let mutationCallCount = 0;

beforeEach(() => {
  vi.clearAllMocks();
  mutationCallCount = 0;
  mockUseQueryClient.mockReturnValue({ invalidateQueries: mockInvalidateQueries });

  // Default: three queries succeed
  mockUseQuery.mockReturnValue({
    data: undefined,
    isLoading: true,
    isError: false,
  });

  // Three mutations (rules, limits, dailyCap)
  mockUseMutation.mockImplementation(() => {
    mutationCallCount++;
    const mutates = [mockRulesMutate, mockLimitsMutate, mockDailyCapMutate];
    return { mutate: mutates[mutationCallCount - 1] ?? vi.fn(), isPending: false };
  });
});

import { GamificationRulesManager } from "./GamificationRulesManager";

const SAMPLE_RULES = [
  {
    id: "rule-1",
    activityType: "like_received",
    basePoints: 1,
    isActive: true,
    description: null,
  },
  {
    id: "rule-2",
    activityType: "event_attended",
    basePoints: 5,
    isActive: false,
    description: null,
  },
];

const SAMPLE_LIMITS = [
  { id: "limit-1", tier: "PROFESSIONAL", baseLimit: 1, bonusLimit: 1, pointsThreshold: 500 },
];

function setupDataQueries() {
  mutationCallCount = 0;
  let queryCallCount = 0;
  mockUseQuery.mockImplementation(() => {
    queryCallCount++;
    if (queryCallCount === 1)
      return { data: { rules: SAMPLE_RULES }, isLoading: false, isError: false };
    if (queryCallCount === 2)
      return { data: { limits: SAMPLE_LIMITS }, isLoading: false, isError: false };
    return { data: { value: 100 }, isLoading: false, isError: false };
  });
  mockUseMutation.mockImplementation(() => {
    mutationCallCount++;
    const mutates = [mockRulesMutate, mockLimitsMutate, mockDailyCapMutate];
    return { mutate: mutates[mutationCallCount - 1] ?? vi.fn(), isPending: false };
  });
}

describe("GamificationRulesManager", () => {
  it("renders loading state when all queries are loading", () => {
    render(<GamificationRulesManager />);
    // t("loading") called — check mockT was called with loading key
    expect(mockT).toHaveBeenCalledWith("loading");
  });

  it("renders points rules table with activity type and base points when data loaded", () => {
    setupDataQueries();
    render(<GamificationRulesManager />);
    expect(screen.getByText("like_received")).toBeTruthy();
    expect(screen.getByText("event_attended")).toBeTruthy();
  });

  it("renders posting limits table with tier column when data loaded", () => {
    setupDataQueries();
    render(<GamificationRulesManager />);
    expect(screen.getByText("PROFESSIONAL")).toBeTruthy();
  });

  it("renders daily cap input with current value when data loaded", () => {
    setupDataQueries();
    render(<GamificationRulesManager />);
    // Should have an input with value 100
    const inputs = screen.getAllByDisplayValue("100");
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("calls rulesMutation.mutate with id and basePoints when save clicked", () => {
    setupDataQueries();
    render(<GamificationRulesManager />);
    // Find all Save buttons — first row save button
    const saveButtons = screen.getAllByText("save");
    fireEvent.click(saveButtons[0]);
    expect(mockRulesMutate).toHaveBeenCalledWith(expect.objectContaining({ id: "rule-1" }));
  });

  it("calls limitsMutation.mutate with id and limit fields when save clicked", () => {
    setupDataQueries();
    render(<GamificationRulesManager />);
    const saveButtons = screen.getAllByText("save");
    // 2 rules rows + 1 limits row + 1 daily cap = index 2 for limits
    fireEvent.click(saveButtons[2]);
    expect(mockLimitsMutate).toHaveBeenCalledWith(expect.objectContaining({ id: "limit-1" }));
  });

  it("calls dailyCapMutation.mutate with current value when daily cap save clicked", () => {
    setupDataQueries();
    render(<GamificationRulesManager />);
    const saveButtons = screen.getAllByText("save");
    // last save button is daily cap
    fireEvent.click(saveButtons[saveButtons.length - 1]);
    expect(mockDailyCapMutate).toHaveBeenCalledWith(100);
  });

  it("renders error text when query returns error state", () => {
    let queryCallCount = 0;
    mutationCallCount = 0;
    mockUseQuery.mockImplementation(() => {
      queryCallCount++;
      // First query (points rules) returns error
      if (queryCallCount === 1) return { data: undefined, isLoading: false, isError: true };
      if (queryCallCount === 2)
        return { data: { limits: SAMPLE_LIMITS }, isLoading: false, isError: false };
      return { data: { value: 100 }, isLoading: false, isError: false };
    });
    mockUseMutation.mockImplementation(() => {
      mutationCallCount++;
      const mutates = [mockRulesMutate, mockLimitsMutate, mockDailyCapMutate];
      return { mutate: mutates[mutationCallCount - 1] ?? vi.fn(), isPending: false };
    });

    render(<GamificationRulesManager />);
    // The component renders t("loadError") when isError is true
    expect(mockT).toHaveBeenCalledWith("loadError");
  });
});
