import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockAcknowledgeGuidelinesAction = vi.fn();
vi.mock("@/features/profiles", () => ({
  acknowledgeGuidelinesAction: (...args: unknown[]) => mockAcknowledgeGuidelinesAction(...args),
}));

import { GuidelinesStep } from "./GuidelinesStep";

const GUIDELINES_HTML = "<p>Community guidelines content</p>";
const DEFAULT_PROPS = {
  guidelinesHtml: GUIDELINES_HTML,
  onComplete: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GuidelinesStep", () => {
  it("renders guidelines HTML content", () => {
    render(<GuidelinesStep {...DEFAULT_PROPS} />);
    expect(screen.getByText("Community guidelines content")).toBeInTheDocument();
  });

  it("renders acknowledgment checkbox", () => {
    render(<GuidelinesStep {...DEFAULT_PROPS} />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("submit button is disabled until checkbox is checked", () => {
    render(<GuidelinesStep {...DEFAULT_PROPS} />);
    const btn = screen.getByRole("button", { name: "continueButton" });
    expect(btn).toBeDisabled();
  });

  it("enables submit button when checkbox is checked", async () => {
    render(<GuidelinesStep {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByRole("checkbox"));
    const btn = screen.getByRole("button", { name: "continueButton" });
    expect(btn).not.toBeDisabled();
  });

  it("shows error when submitting without acknowledging", async () => {
    render(<GuidelinesStep {...DEFAULT_PROPS} />);
    // Force-click button (even if disabled, test the guard logic)
    const form = screen.getByRole("checkbox").closest("form")!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("errors.mustAcknowledge");
    });
  });

  it("calls acknowledgeGuidelinesAction and onComplete when acknowledged", async () => {
    const onComplete = vi.fn();
    mockAcknowledgeGuidelinesAction.mockResolvedValue({ success: true });
    render(<GuidelinesStep {...DEFAULT_PROPS} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "continueButton" }));

    await waitFor(() => {
      expect(mockAcknowledgeGuidelinesAction).toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it("shows error when acknowledgeGuidelinesAction fails", async () => {
    mockAcknowledgeGuidelinesAction.mockResolvedValue({ success: false, error: "Network error" });
    render(<GuidelinesStep {...DEFAULT_PROPS} />);

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "continueButton" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Network error");
    });
    expect(DEFAULT_PROPS.onComplete).not.toHaveBeenCalled();
  });
});
