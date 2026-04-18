// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardLayout from "./layout";

vi.mock("@/components/layout/portal-layout", () => ({
  PortalLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="portal-layout">{children}</div>
  ),
}));

describe("DashboardLayout", () => {
  it("renders PortalLayout", () => {
    render(<DashboardLayout>content</DashboardLayout>);
    expect(screen.getByTestId("portal-layout")).toBeInTheDocument();
  });

  it("passes children through", () => {
    render(
      <DashboardLayout>
        <span data-testid="child">test</span>
      </DashboardLayout>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});
