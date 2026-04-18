// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SavedJobsLayout from "./layout";

vi.mock("@/components/layout/portal-layout", () => ({
  PortalLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="portal-layout">{children}</div>
  ),
}));

describe("SavedJobsLayout", () => {
  it("renders PortalLayout", () => {
    render(<SavedJobsLayout>content</SavedJobsLayout>);
    expect(screen.getByTestId("portal-layout")).toBeInTheDocument();
  });

  it("passes children through", () => {
    render(
      <SavedJobsLayout>
        <span data-testid="child">test</span>
      </SavedJobsLayout>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});
