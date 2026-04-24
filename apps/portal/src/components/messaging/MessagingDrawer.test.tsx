// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

// ── i18n mock ──────────────────────────────────────────────────────────────────
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      loadError: "Failed to load conversation. Please try again.",
    };
    return map[key] ?? key;
  },
}));

// ── ConversationThread mock ────────────────────────────────────────────────────
vi.mock("./ConversationThread", () => ({
  ConversationThread: ({
    applicationId,
    readOnly,
    otherParticipantName,
  }: {
    applicationId: string;
    readOnly?: boolean;
    otherParticipantName?: string;
  }) => (
    <div
      data-testid="conversation-thread"
      data-application-id={applicationId}
      data-read-only={readOnly ? "true" : "false"}
      data-other-participant={otherParticipantName}
    >
      Thread content
    </div>
  ),
}));

// ── fetch mock ────────────────────────────────────────────────────────────────
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { MessagingDrawer } from "./MessagingDrawer";

function makeStatusResponse(status: { exists: boolean; readOnly: boolean; unreadCount: number }) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: status }),
  });
}

const APP_ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
});

describe("MessagingDrawer", () => {
  it("renders Sheet with ConversationThread when open", async () => {
    mockFetch.mockReturnValue(
      makeStatusResponse({ exists: true, readOnly: false, unreadCount: 0 }),
    );

    render(
      <MessagingDrawer
        applicationId={APP_ID}
        open={true}
        onOpenChange={vi.fn()}
        otherParticipantName="Alice Smith"
      />,
    );

    await waitFor(() => expect(screen.getByTestId("conversation-thread")).toBeInTheDocument());
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
  });

  it("fetches conversation status on open", async () => {
    mockFetch.mockReturnValue(
      makeStatusResponse({ exists: true, readOnly: false, unreadCount: 0 }),
    );

    render(
      <MessagingDrawer
        applicationId={APP_ID}
        open={true}
        onOpenChange={vi.fn()}
        otherParticipantName="Alice"
      />,
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(mockFetch).toHaveBeenCalledWith(`/api/v1/conversations/${APP_ID}/status`);
  });

  it("does not fetch when drawer is closed", () => {
    render(
      <MessagingDrawer
        applicationId={APP_ID}
        open={false}
        onOpenChange={vi.fn()}
        otherParticipantName="Alice"
      />,
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows loading skeleton while fetching", () => {
    // Never-resolving fetch to keep loading state
    mockFetch.mockReturnValue(new Promise(() => undefined));

    render(
      <MessagingDrawer
        applicationId={APP_ID}
        open={true}
        onOpenChange={vi.fn()}
        otherParticipantName="Alice"
      />,
    );

    expect(screen.getByTestId("messaging-drawer-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("conversation-thread")).not.toBeInTheDocument();
  });

  it("passes readOnly=false to ConversationThread when not read-only", async () => {
    mockFetch.mockReturnValue(
      makeStatusResponse({ exists: true, readOnly: false, unreadCount: 0 }),
    );

    render(
      <MessagingDrawer
        applicationId={APP_ID}
        open={true}
        onOpenChange={vi.fn()}
        otherParticipantName="Alice"
      />,
    );

    await waitFor(() => expect(screen.getByTestId("conversation-thread")).toBeInTheDocument());
    expect(screen.getByTestId("conversation-thread")).toHaveAttribute("data-read-only", "false");
  });

  it("passes readOnly=true to ConversationThread when conversation is read-only", async () => {
    mockFetch.mockReturnValue(makeStatusResponse({ exists: true, readOnly: true, unreadCount: 0 }));

    render(
      <MessagingDrawer
        applicationId={APP_ID}
        open={true}
        onOpenChange={vi.fn()}
        otherParticipantName="Alice"
      />,
    );

    await waitFor(() => expect(screen.getByTestId("conversation-thread")).toBeInTheDocument());
    expect(screen.getByTestId("conversation-thread")).toHaveAttribute("data-read-only", "true");
  });

  it("passes otherParticipantName to ConversationThread", async () => {
    mockFetch.mockReturnValue(
      makeStatusResponse({ exists: true, readOnly: false, unreadCount: 0 }),
    );

    render(
      <MessagingDrawer
        applicationId={APP_ID}
        open={true}
        onOpenChange={vi.fn()}
        otherParticipantName="Bob Jones"
      />,
    );

    await waitFor(() => expect(screen.getByTestId("conversation-thread")).toBeInTheDocument());
    expect(screen.getByTestId("conversation-thread")).toHaveAttribute(
      "data-other-participant",
      "Bob Jones",
    );
  });

  it("shows error state when status fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    render(
      <MessagingDrawer
        applicationId={APP_ID}
        open={true}
        onOpenChange={vi.fn()}
        otherParticipantName="Alice"
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("Failed to load conversation. Please try again."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("conversation-thread")).not.toBeInTheDocument();
  });

  it("closing sheet calls onOpenChange(false)", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockFetch.mockReturnValue(
      makeStatusResponse({ exists: true, readOnly: false, unreadCount: 0 }),
    );

    render(
      <MessagingDrawer
        applicationId={APP_ID}
        open={true}
        onOpenChange={onOpenChange}
        otherParticipantName="Alice"
      />,
    );

    await waitFor(() => expect(screen.getByTestId("conversation-thread")).toBeInTheDocument());

    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("drawer passes axe accessibility check when open", async () => {
    mockFetch.mockReturnValue(
      makeStatusResponse({ exists: true, readOnly: false, unreadCount: 0 }),
    );

    const { container } = render(
      <MessagingDrawer
        applicationId={APP_ID}
        open={true}
        onOpenChange={vi.fn()}
        otherParticipantName="Alice Smith"
      />,
    );

    await waitFor(() => expect(screen.getByTestId("conversation-thread")).toBeInTheDocument());

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
