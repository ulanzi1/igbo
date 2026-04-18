// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ApprenticeshipsLayout from "./layout";

vi.mock("@/components/layout/portal-layout", () => ({
  PortalLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="portal-layout">{children}</div>
  ),
}));

describe("ApprenticeshipsLayout", () => {
  it("renders PortalLayout", () => {
    render(<ApprenticeshipsLayout>content</ApprenticeshipsLayout>);
    expect(screen.getByTestId("portal-layout")).toBeInTheDocument();
  });

  it("passes children through", () => {
    render(
      <ApprenticeshipsLayout>
        <span data-testid="child">test</span>
      </ApprenticeshipsLayout>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});
