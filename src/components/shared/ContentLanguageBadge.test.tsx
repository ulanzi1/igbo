// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import { ContentLanguageBadge } from "./ContentLanguageBadge";

describe("ContentLanguageBadge", () => {
  it("renders EN label for English", () => {
    render(<ContentLanguageBadge language="en" />);
    expect(screen.getByText("EN")).toBeInTheDocument();
  });

  it("renders IG label for Igbo", () => {
    render(<ContentLanguageBadge language="ig" />);
    expect(screen.getByText("IG")).toBeInTheDocument();
  });

  it("renders EN + IG label for both", () => {
    render(<ContentLanguageBadge language="both" />);
    expect(screen.getByText("EN + IG")).toBeInTheDocument();
  });

  it("applies aria-label when provided", () => {
    render(<ContentLanguageBadge language="en" ariaLabel="Content in English" />);
    expect(screen.getByLabelText("Content in English")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<ContentLanguageBadge language="ig" className="custom-class" />);
    expect(container.firstChild).toHaveClass("custom-class");
  });
});
