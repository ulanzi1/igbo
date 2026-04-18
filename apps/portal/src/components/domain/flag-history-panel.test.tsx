import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { FlagHistoryPanel } from "./flag-history-panel";
import { adminFlagFactory } from "@/test/factories";

// jsdom doesn't implement pointer capture or scrollIntoView
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
});

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

expect.extend(toHaveNoViolations);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

global.fetch = vi.fn();

const BASE_FLAG = adminFlagFactory({
  id: "flag-1",
  postingId: "posting-1",
  adminUserId: "admin-1",
  description: "This posting contains misleading information about the role.",
  createdAt: new Date("2026-04-01"),
});

const RESOLVED_FLAG = {
  ...BASE_FLAG,
  id: "flag-2",
  status: "resolved" as const,
  resolutionAction: "reject",
  resolutionNote: "This is a confirmed scam posting that must be removed permanently.",
  resolvedAt: new Date("2026-04-02"),
  resolvedByUserId: "admin-1",
};

const DISMISSED_FLAG = {
  ...BASE_FLAG,
  id: "flag-3",
  status: "dismissed" as const,
  resolutionAction: "dismiss",
  resolutionNote: "Upon further review, this was not a genuine policy violation at all.",
  resolvedAt: new Date("2026-04-03"),
  resolvedByUserId: "admin-2",
};

const BASE_PROPS = {
  postingTitle: "Software Engineer",
};

beforeEach(() => {
  vi.clearAllMocks();
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({}),
  });
});

describe("FlagHistoryPanel", () => {
  it("renders empty state when no flags", () => {
    renderWithPortalProviders(<FlagHistoryPanel {...BASE_PROPS} flags={[]} />);
    expect(screen.getByTestId("flag-history-empty")).toBeInTheDocument();
  });

  it("renders flag list when flags exist", () => {
    renderWithPortalProviders(<FlagHistoryPanel {...BASE_PROPS} flags={[BASE_FLAG as never]} />);
    expect(screen.getByTestId("flag-history-panel")).toBeInTheDocument();
    expect(screen.getByTestId(`flag-item-${BASE_FLAG.id}`)).toBeInTheDocument();
  });

  it("shows severity badge for each flag", () => {
    renderWithPortalProviders(<FlagHistoryPanel {...BASE_PROPS} flags={[BASE_FLAG as never]} />);
    expect(screen.getByTestId(`flag-severity-badge-${BASE_FLAG.id}`)).toBeInTheDocument();
  });

  it("shows status badge for open flag", () => {
    renderWithPortalProviders(<FlagHistoryPanel {...BASE_PROPS} flags={[BASE_FLAG as never]} />);
    const statusBadge = screen.getByTestId(`flag-status-badge-${BASE_FLAG.id}`);
    expect(statusBadge).toBeInTheDocument();
    expect(statusBadge.textContent).toContain("Open");
  });

  it("shows resolve button for open flags", () => {
    renderWithPortalProviders(<FlagHistoryPanel {...BASE_PROPS} flags={[BASE_FLAG as never]} />);
    expect(screen.getByTestId(`flag-resolve-btn-${BASE_FLAG.id}`)).toBeInTheDocument();
  });

  it("does not show resolve button for resolved flags", () => {
    renderWithPortalProviders(
      <FlagHistoryPanel {...BASE_PROPS} flags={[RESOLVED_FLAG as never]} />,
    );
    expect(screen.queryByTestId(`flag-resolve-btn-${RESOLVED_FLAG.id}`)).not.toBeInTheDocument();
  });

  it("shows resolution note for resolved flags", () => {
    renderWithPortalProviders(
      <FlagHistoryPanel {...BASE_PROPS} flags={[RESOLVED_FLAG as never]} />,
    );
    expect(screen.getByTestId(`flag-resolution-${RESOLVED_FLAG.id}`)).toBeInTheDocument();
    expect(screen.getByText(RESOLVED_FLAG.resolutionNote!)).toBeInTheDocument();
  });

  it("shows resolution note for dismissed flags", () => {
    renderWithPortalProviders(
      <FlagHistoryPanel {...BASE_PROPS} flags={[DISMISSED_FLAG as never]} />,
    );
    expect(screen.getByTestId(`flag-resolution-${DISMISSED_FLAG.id}`)).toBeInTheDocument();
  });

  it("renders flag description", () => {
    renderWithPortalProviders(<FlagHistoryPanel {...BASE_PROPS} flags={[BASE_FLAG as never]} />);
    expect(screen.getByTestId(`flag-description-${BASE_FLAG.id}`)).toBeInTheDocument();
    expect(
      screen.getByText("This posting contains misleading information about the role."),
    ).toBeInTheDocument();
  });

  it("shows auto-paused indicator when autoPaused=true", () => {
    const highFlag = { ...BASE_FLAG, severity: "high", autoPaused: true };
    renderWithPortalProviders(<FlagHistoryPanel {...BASE_PROPS} flags={[highFlag as never]} />);
    expect(screen.getByTestId(`flag-auto-paused-${BASE_FLAG.id}`)).toBeInTheDocument();
  });

  it("renders multiple flags", () => {
    renderWithPortalProviders(
      <FlagHistoryPanel
        {...BASE_PROPS}
        flags={[BASE_FLAG as never, RESOLVED_FLAG as never, DISMISSED_FLAG as never]}
      />,
    );
    expect(screen.getByTestId(`flag-item-${BASE_FLAG.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`flag-item-${RESOLVED_FLAG.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`flag-item-${DISMISSED_FLAG.id}`)).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithPortalProviders(
      <FlagHistoryPanel {...BASE_PROPS} flags={[BASE_FLAG as never, RESOLVED_FLAG as never]} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
