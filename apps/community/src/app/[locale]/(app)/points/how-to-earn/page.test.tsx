// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/db/queries/points", () => ({
  getActivePointsRules: vi.fn(),
  getAllPostingLimits: vi.fn(),
}));

vi.mock("next-intl/server", () => {
  const t = (key: string, params?: Record<string, unknown>) => {
    if (params && "value" in params) return `×${params.value}`;
    return key;
  };
  t.has = () => true;
  return {
    getTranslations: vi.fn().mockResolvedValue(t),
  };
});

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("@igbo/config/points", () => ({
  BADGE_MULTIPLIERS: { blue: 3, red: 6, purple: 10 },
}));

import { getActivePointsRules, getAllPostingLimits } from "@/db/queries/points";
import HowToEarnPage from "./page";

const mockGetActivePointsRules = getActivePointsRules as ReturnType<typeof vi.fn>;
const mockGetAllPostingLimits = getAllPostingLimits as ReturnType<typeof vi.fn>;

const makeRule = (id: string, activityType: string, basePoints: number) => ({
  id,
  activityType,
  basePoints,
  description: `${activityType} description`,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeProfessionalRow = (id: string, threshold: number, bonus: number) => ({
  id,
  tier: "PROFESSIONAL",
  baseLimit: 1,
  pointsThreshold: threshold,
  bonusLimit: bonus,
});

const makeTopTierRow = (id: string, threshold: number, bonus: number) => ({
  id,
  tier: "TOP_TIER",
  baseLimit: 2,
  pointsThreshold: threshold,
  bonusLimit: bonus,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetActivePointsRules.mockResolvedValue([]);
  mockGetAllPostingLimits.mockResolvedValue([]);
});

async function renderPage() {
  const jsx = await HowToEarnPage({ params: Promise.resolve({ locale: "en" }) });
  return render(jsx);
}

describe("HowToEarnPage", () => {
  it("renders the page title", async () => {
    const { getByText } = await renderPage();
    expect(getByText("howToEarn.title")).toBeInTheDocument();
  });

  it("renders all active earning rule rows", async () => {
    mockGetActivePointsRules.mockResolvedValue([
      makeRule("r1", "like_received", 1),
      makeRule("r2", "event_attended", 5),
    ]);

    const { getAllByRole } = await renderPage();
    const rows = getAllByRole("row");
    // 1 header row + 2 data rows = 3 in earning rules table
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it("renders base points for each rule", async () => {
    mockGetActivePointsRules.mockResolvedValue([
      makeRule("r1", "like_received", 3),
      makeRule("r2", "event_attended", 10),
    ]);

    const { getByText } = await renderPage();
    expect(getByText("3")).toBeInTheDocument();
    expect(getByText("10")).toBeInTheDocument();
  });

  it("shows noRules message when rules array is empty", async () => {
    mockGetActivePointsRules.mockResolvedValue([]);

    const { getByText } = await renderPage();
    expect(getByText("howToEarn.earningRules.noRules")).toBeInTheDocument();
  });

  it("renders all 3 badge multiplier rows (blue/red/purple)", async () => {
    const { getByText } = await renderPage();
    expect(getByText("×3")).toBeInTheDocument();
    expect(getByText("×6")).toBeInTheDocument();
    expect(getByText("×10")).toBeInTheDocument();
  });

  it("renders Professional posting limits table rows", async () => {
    mockGetAllPostingLimits.mockResolvedValue([
      makeProfessionalRow("p1", 0, 0),
      makeProfessionalRow("p2", 500, 1),
      makeProfessionalRow("p3", 2000, 2),
    ]);

    const { getByText } = await renderPage();
    // baseLimit(1)+bonusLimit(0)=1, (1)+1=2, (1)+2=3
    expect(getByText("1")).toBeInTheDocument();
    expect(getByText("2")).toBeInTheDocument();
    expect(getByText("3")).toBeInTheDocument();
  });

  it("renders Top Tier posting limits table rows", async () => {
    mockGetAllPostingLimits.mockResolvedValue([
      makeTopTierRow("t1", 0, 0),
      makeTopTierRow("t2", 1000, 1),
      makeTopTierRow("t3", 3000, 2),
      makeTopTierRow("t4", 7500, 3),
      makeTopTierRow("t5", 15000, 4),
      makeTopTierRow("t6", 30000, 5),
    ]);

    const { getByText } = await renderPage();
    // baseLimit(2)+bonusLimit values: 2,3,4,5,6,7
    expect(getByText("7")).toBeInTheDocument(); // 2+5
  });

  it("renders BASIC ineligibility note", async () => {
    const { getByText } = await renderPage();
    expect(getByText("howToEarn.postingLimits.basicNote")).toBeInTheDocument();
  });
});
