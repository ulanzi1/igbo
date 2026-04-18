// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SavedSearchesLayout from "./layout";

vi.mock("@/components/layout/portal-layout", () => ({
  PortalLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="portal-layout">{children}</div>
  ),
}));

describe("SavedSearchesLayout", () => {
  it("renders PortalLayout", () => {
    render(<SavedSearchesLayout>content</SavedSearchesLayout>);
    expect(screen.getByTestId("portal-layout")).toBeInTheDocument();
  });

  it("passes children through", () => {
    render(
      <SavedSearchesLayout>
        <span data-testid="child">test</span>
      </SavedSearchesLayout>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});
