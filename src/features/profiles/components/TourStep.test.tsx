import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
  useLocale: () => "en",
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ update: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockCompleteTourAction = vi.fn();
vi.mock("@/features/profiles", () => ({
  completeTourAction: (...args: unknown[]) => mockCompleteTourAction(...args),
}));

import { TourStep } from "./TourStep";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TourStep", () => {
  it("renders the first tour section (dashboard) on mount", () => {
    render(<TourStep />);
    expect(screen.getByText("sections.dashboard.title")).toBeInTheDocument();
    expect(screen.getByText("sections.dashboard.description")).toBeInTheDocument();
  });

  it("renders navigation progress dots", () => {
    render(<TourStep />);
    // 6 sections → 6 dots
    const buttons = screen.getAllByRole("button", { name: /Go to .+ step/i });
    expect(buttons).toHaveLength(6);
  });

  it("advances to next section on Next click", async () => {
    render(<TourStep />);
    fireEvent.click(screen.getByText("nextButton"));
    await waitFor(() => {
      expect(screen.getByText("sections.chat.title")).toBeInTheDocument();
    });
  });

  it("renders completeButton on the last section", async () => {
    render(<TourStep />);
    // Click through all sections to reach the last
    const nextBtns = () => screen.queryByText("nextButton");
    while (nextBtns()) {
      fireEvent.click(nextBtns()!);
      await waitFor(() => {}); // flush state updates
    }
    expect(screen.getByRole("button", { name: "completeButton" })).toBeInTheDocument();
  });

  it("calls completeTourAction with skipped:false on complete", async () => {
    mockCompleteTourAction.mockResolvedValue({ success: true });
    render(<TourStep />);
    // Navigate to last step
    const nextBtns = () => screen.queryByText("nextButton");
    while (nextBtns()) fireEvent.click(nextBtns()!);
    fireEvent.click(screen.getByRole("button", { name: "completeButton" }));
    await waitFor(() => {
      expect(mockCompleteTourAction).toHaveBeenCalledWith({ skipped: false });
    });
  });

  it("calls completeTourAction with skipped:true when skip is clicked", async () => {
    mockCompleteTourAction.mockResolvedValue({ success: true });
    render(<TourStep />);
    fireEvent.click(screen.getByRole("button", { name: "skipButton" }));
    await waitFor(() => {
      expect(mockCompleteTourAction).toHaveBeenCalledWith({ skipped: true });
    });
  });

  it("shows error when completeTourAction fails", async () => {
    mockCompleteTourAction.mockResolvedValue({ success: false, error: "Failed to save" });
    render(<TourStep />);
    fireEvent.click(screen.getByRole("button", { name: "skipButton" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to save");
    });
  });
});
