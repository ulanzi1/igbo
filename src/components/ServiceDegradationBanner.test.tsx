// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUseServiceHealth = vi.fn();
vi.mock("@/lib/service-health", () => ({
  useServiceHealth: () => mockUseServiceHealth(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { ServiceDegradationBanner } from "./ServiceDegradationBanner";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ServiceDegradationBanner — chat context", () => {
  it("shows banner when chatAvailable is false", () => {
    mockUseServiceHealth.mockReturnValue({
      chatAvailable: false,
      videoAvailable: true,
      degradedServices: ["chat"],
    });

    render(<ServiceDegradationBanner context="chat" />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("chatUnavailable")).toBeInTheDocument();
  });

  it("does not show banner when chatAvailable is true", () => {
    mockUseServiceHealth.mockReturnValue({
      chatAvailable: true,
      videoAvailable: true,
      degradedServices: [],
    });

    render(<ServiceDegradationBanner context="chat" />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("is dismissable", () => {
    mockUseServiceHealth.mockReturnValue({
      chatAvailable: false,
      videoAvailable: true,
      degradedServices: ["chat"],
    });

    render(<ServiceDegradationBanner context="chat" />);

    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ServiceDegradationBanner — video context", () => {
  it("shows banner when videoAvailable is false", () => {
    mockUseServiceHealth.mockReturnValue({
      chatAvailable: true,
      videoAvailable: false,
      degradedServices: ["video"],
    });

    render(<ServiceDegradationBanner context="video" />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("videoUnavailable")).toBeInTheDocument();
  });

  it("does not show banner when videoAvailable is true", () => {
    mockUseServiceHealth.mockReturnValue({
      chatAvailable: true,
      videoAvailable: true,
      degradedServices: [],
    });

    render(<ServiceDegradationBanner context="video" />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
