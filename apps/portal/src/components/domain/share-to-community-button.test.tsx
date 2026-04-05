// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { axe, toHaveNoViolations } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { renderWithPortalProviders, screen, waitFor } from "@/test-utils/render";
import {
  ShareToCommunityButton,
  ShareToCommunityButtonSkeleton,
} from "./share-to-community-button";

expect.extend(toHaveNoViolations);

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { toast } from "sonner";

function mockFetch(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ShareToCommunityButton", () => {
  it("renders share button for active unshared posting", () => {
    renderWithPortalProviders(
      <ShareToCommunityButton jobId="jp-1" isActive={true} isShared={false} />,
    );
    expect(screen.getByRole("button", { name: /Share to Community/i })).toBeInTheDocument();
  });

  it("renders disabled button with tooltip when posting is not active", () => {
    renderWithPortalProviders(
      <ShareToCommunityButton jobId="jp-1" isActive={false} isShared={false} />,
    );
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
  });

  it("renders shared state with check icon when already shared", () => {
    renderWithPortalProviders(
      <ShareToCommunityButton jobId="jp-1" isActive={true} isShared={true} />,
    );
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(screen.getByText(/Shared to Community/i)).toBeInTheDocument();
  });

  it("calls API and shows success toast on successful share", async () => {
    mockFetch(200, { data: { success: true, communityPostId: "comm-1" } });
    const user = userEvent.setup();
    renderWithPortalProviders(
      <ShareToCommunityButton jobId="jp-1" isActive={true} isShared={false} />,
    );
    const btn = screen.getByRole("button", { name: /Share to Community/i });
    await user.click(btn);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/jobs/jp-1/share-community",
        expect.objectContaining({ method: "POST" }),
      );
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("shared"));
    });
  });

  it("shows error toast on API failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    const user = userEvent.setup();
    renderWithPortalProviders(
      <ShareToCommunityButton jobId="jp-1" isActive={true} isShared={false} />,
    );
    const btn = screen.getByRole("button", { name: /Share to Community/i });
    await user.click(btn);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it("shows info toast when already shared (409 response)", async () => {
    mockFetch(409, { extensions: { code: "PORTAL_ERRORS.ALREADY_SHARED" } });
    const user = userEvent.setup();
    renderWithPortalProviders(
      <ShareToCommunityButton jobId="jp-1" isActive={true} isShared={false} />,
    );
    const btn = screen.getByRole("button", { name: /Share to Community/i });
    await user.click(btn);
    await waitFor(() => {
      expect(toast.info).toHaveBeenCalled();
    });
  });

  it("passes accessibility check for active state", async () => {
    const { container } = renderWithPortalProviders(
      <ShareToCommunityButton jobId="jp-1" isActive={true} isShared={false} />,
    );
    // @ts-expect-error — jest-axe matcher not in vitest types
    expect(await axe(container)).toHaveNoViolations();
  });

  it("passes accessibility check for disabled (non-active) state", async () => {
    const { container } = renderWithPortalProviders(
      <ShareToCommunityButton jobId="jp-1" isActive={false} isShared={false} />,
    );
    // @ts-expect-error — jest-axe matcher not in vitest types
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("ShareToCommunityButtonSkeleton", () => {
  it("renders without crashing", () => {
    const { container } = renderWithPortalProviders(<ShareToCommunityButtonSkeleton />);
    expect(container.firstChild).toBeTruthy();
  });
});
