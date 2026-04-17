// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { fireEvent, act } from "@testing-library/react";
import { CompleteProfilePrompt } from "./complete-profile-prompt";

expect.extend(toHaveNoViolations);

beforeEach(() => {
  // Clear sessionStorage before each test to ensure a clean slate
  sessionStorage.clear();
});

describe("CompleteProfilePrompt — rendering", () => {
  it("renders the prompt text", () => {
    renderWithPortalProviders(<CompleteProfilePrompt />);
    expect(screen.getByText("Complete your profile to see how well you match")).toBeInTheDocument();
  });

  it("renders the complete profile link", () => {
    renderWithPortalProviders(<CompleteProfilePrompt />);
    const link = screen.getByTestId("complete-profile-link");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/en/profile");
    expect(link).toHaveTextContent("Complete Profile");
  });

  it("renders the dismiss button", () => {
    renderWithPortalProviders(<CompleteProfilePrompt />);
    expect(screen.getByTestId("dismiss-match-prompt")).toBeInTheDocument();
  });
});

describe("CompleteProfilePrompt — dismiss behavior", () => {
  it("hides the prompt when dismiss button is clicked", async () => {
    renderWithPortalProviders(<CompleteProfilePrompt />);
    const prompt = screen.getByTestId("complete-profile-prompt");
    expect(prompt).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("dismiss-match-prompt"));
    });

    expect(screen.queryByTestId("complete-profile-prompt")).not.toBeInTheDocument();
  });

  it("does NOT render when sessionStorage already has match_prompt_dismissed", async () => {
    sessionStorage.setItem("match_prompt_dismissed", "true");
    renderWithPortalProviders(<CompleteProfilePrompt />);

    // After useEffect fires (which reads sessionStorage), the prompt should be hidden
    // The prompt starts as dismissed=true (default) so no flash
    expect(screen.queryByTestId("complete-profile-prompt")).not.toBeInTheDocument();
  });

  it("persists dismiss state to sessionStorage", async () => {
    renderWithPortalProviders(<CompleteProfilePrompt />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("dismiss-match-prompt"));
    });

    expect(sessionStorage.getItem("match_prompt_dismissed")).toBe("true");
  });
});

describe("CompleteProfilePrompt — accessibility", () => {
  it("passes axe check", async () => {
    const { container } = renderWithPortalProviders(<CompleteProfilePrompt />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
