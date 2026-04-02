import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/utils", () => ({ cn: (...args: string[]) => args.filter(Boolean).join(" ") }));

import { DeliveryIndicator } from "./DeliveryIndicator";

describe("DeliveryIndicator", () => {
  it("renders single tick for sending status with reduced opacity", () => {
    const { container } = render(<DeliveryIndicator status="sending" />);
    expect(container.textContent).toBe("✓");
    expect(container.querySelector(".opacity-50")).toBeTruthy();
  });

  it("renders single tick for sent status", () => {
    render(<DeliveryIndicator status="sent" />);
    expect(screen.getByLabelText("sent")).toBeInTheDocument();
    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  it("renders double tick for delivered status", () => {
    render(<DeliveryIndicator status="delivered" />);
    expect(screen.getByLabelText("delivered")).toBeInTheDocument();
    expect(screen.getByText("✓✓")).toBeInTheDocument();
  });

  it("renders error indicator for error status", () => {
    render(<DeliveryIndicator status="error" />);
    expect(screen.getByLabelText("failedToSend")).toBeInTheDocument();
  });

  it("renders double tick in text-blue-500 class for read status", () => {
    const { container } = render(<DeliveryIndicator status="read" />);
    expect(screen.getByLabelText("read")).toBeInTheDocument();
    expect(screen.getByText("✓✓")).toBeInTheDocument();
    expect(container.querySelector(".text-blue-500")).toBeTruthy();
  });
});
