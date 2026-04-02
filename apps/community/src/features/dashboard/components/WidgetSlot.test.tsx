// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { WidgetSlot } from "./WidgetSlot";

// A component that intentionally throws during render
function ThrowingChild() {
  throw new Error("Widget render error");
}

describe("WidgetSlot", () => {
  it("renders null when enabled=false", () => {
    const { container } = render(
      <WidgetSlot enabled={false} title="People Near You">
        <p>Widget content</p>
      </WidgetSlot>,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText("Widget content")).not.toBeInTheDocument();
  });

  it("renders children when enabled=true", () => {
    render(
      <WidgetSlot enabled={true} title="My Widget">
        <p>Widget content</p>
      </WidgetSlot>,
    );
    expect(screen.getByText("Widget content")).toBeInTheDocument();
  });

  it("renders skeleton when enabled=true and loading=true", () => {
    const { container } = render(
      <WidgetSlot enabled={true} title="My Widget" loading={true}>
        <p>Widget content</p>
      </WidgetSlot>,
    );
    // Children not visible during loading
    expect(screen.queryByText("Widget content")).not.toBeInTheDocument();
    const skeleton = container.querySelector('[data-slot="skeleton"]');
    expect(skeleton).toBeInTheDocument();
  });

  it("does not render skeleton when enabled=true and loading=false (default)", () => {
    const { container } = render(
      <WidgetSlot enabled={true} title="My Widget">
        <p>Widget content</p>
      </WidgetSlot>,
    );
    expect(screen.getByText("Widget content")).toBeInTheDocument();
    const skeleton = container.querySelector('[data-slot="skeleton"]');
    expect(skeleton).not.toBeInTheDocument();
  });

  it("shows error boundary fallback when child throws", () => {
    // Suppress console.error for this test
    const originalError = console.error;
    console.error = vi.fn();

    render(
      <WidgetSlot enabled={true} title="Broken Widget">
        <ThrowingChild />
      </WidgetSlot>,
    );

    expect(screen.getByText("widget.error")).toBeInTheDocument();

    console.error = originalError;
  });

  it("wraps children with the widget title as aria-label", () => {
    render(
      <WidgetSlot enabled={true} title="Points Balance">
        <p>100 points</p>
      </WidgetSlot>,
    );
    const wrapper = screen.getByLabelText("Points Balance");
    expect(wrapper).toBeInTheDocument();
  });
});
