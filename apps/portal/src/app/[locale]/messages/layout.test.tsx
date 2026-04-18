// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MessagesLayout from "./layout";

vi.mock("@/components/layout/portal-layout", () => ({
  PortalLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="portal-layout">{children}</div>
  ),
}));

describe("MessagesLayout", () => {
  it("renders PortalLayout", () => {
    render(<MessagesLayout>content</MessagesLayout>);
    expect(screen.getByTestId("portal-layout")).toBeInTheDocument();
  });

  it("passes children through", () => {
    render(
      <MessagesLayout>
        <span data-testid="child">test</span>
      </MessagesLayout>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});
