// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ── i18n mock ──────────────────────────────────────────────────────────────────
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (key === "unreadBadgeLabel" && params?.count) return `${params.count} unread messages`;
    const map: Record<string, string> = {
      messageEmployer: "Message Employer",
      noConversationYet:
        "The employer will be able to message you once they review your application.",
    };
    return map[key] ?? key;
  },
}));

// ── MessagingDrawer mock ───────────────────────────────────────────────────────
vi.mock("@/components/messaging/MessagingDrawer", () => ({
  MessagingDrawer: ({
    applicationId,
    open,
    onOpenChange,
  }: {
    applicationId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    otherParticipantName: string;
  }) =>
    open ? (
      <div data-testid="messaging-drawer" data-application-id={applicationId}>
        <button onClick={() => onOpenChange(false)}>Close drawer</button>
      </div>
    ) : null,
}));

import { ApplicationMessagingSection } from "./application-messaging-section";

const APP_ID = "00000000-0000-4000-8000-000000000001";

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: { exists: true, readOnly: false, unreadCount: 0 } }),
  });
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe("ApplicationMessagingSection", () => {
  it("renders 'Message Employer' button when conversation exists", () => {
    render(
      <ApplicationMessagingSection
        applicationId={APP_ID}
        conversationExists={true}
        readOnly={false}
        otherPartyName="Acme Corp"
        unreadCount={0}
      />,
    );
    expect(screen.getByTestId("message-employer-button")).toBeInTheDocument();
    expect(screen.getByTestId("message-employer-button")).toHaveTextContent("Message Employer");
  });

  it("renders informational note when no conversation exists", () => {
    render(
      <ApplicationMessagingSection
        applicationId={APP_ID}
        conversationExists={false}
        readOnly={false}
        otherPartyName="Acme Corp"
        unreadCount={0}
      />,
    );
    expect(screen.getByTestId("no-conversation-note")).toBeInTheDocument();
    expect(screen.getByTestId("no-conversation-note")).toHaveTextContent(
      "The employer will be able to message you once they review your application.",
    );
    expect(screen.queryByTestId("message-employer-button")).not.toBeInTheDocument();
  });

  it("button click opens MessagingDrawer", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationMessagingSection
        applicationId={APP_ID}
        conversationExists={true}
        readOnly={false}
        otherPartyName="Acme Corp"
        unreadCount={0}
      />,
    );

    expect(screen.queryByTestId("messaging-drawer")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("message-employer-button"));
    expect(screen.getByTestId("messaging-drawer")).toBeInTheDocument();
    expect(screen.getByTestId("messaging-drawer")).toHaveAttribute("data-application-id", APP_ID);
  });

  it("shows unread badge when unreadCount > 0", () => {
    render(
      <ApplicationMessagingSection
        applicationId={APP_ID}
        conversationExists={true}
        readOnly={false}
        otherPartyName="Acme Corp"
        unreadCount={3}
      />,
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByTestId("message-employer-button")).toHaveAttribute(
      "aria-label",
      "3 unread messages",
    );
  });

  it("does not show unread badge when unreadCount is 0", () => {
    render(
      <ApplicationMessagingSection
        applicationId={APP_ID}
        conversationExists={true}
        readOnly={false}
        otherPartyName="Acme Corp"
        unreadCount={0}
      />,
    );
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-employer-button")).toHaveAttribute(
      "aria-label",
      "Message Employer",
    );
  });

  it("fetches fresh unread count on mount when conversation exists (P9)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { exists: true, readOnly: false, unreadCount: 5 } }),
    });
    render(
      <ApplicationMessagingSection
        applicationId={APP_ID}
        conversationExists={true}
        readOnly={false}
        otherPartyName="Acme Corp"
        unreadCount={0}
      />,
    );
    await waitFor(() => expect(screen.getByText("5")).toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledWith(`/api/v1/conversations/${APP_ID}/status`);
  });

  it("resets unread count to 0 when drawer opens (P9)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { exists: true, readOnly: false, unreadCount: 3 } }),
    });
    const user = userEvent.setup();
    render(
      <ApplicationMessagingSection
        applicationId={APP_ID}
        conversationExists={true}
        readOnly={false}
        otherPartyName="Acme Corp"
        unreadCount={0}
      />,
    );
    await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument());

    await user.click(screen.getByTestId("message-employer-button"));
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });

  it("MessagingDrawer can be closed", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationMessagingSection
        applicationId={APP_ID}
        conversationExists={true}
        readOnly={false}
        otherPartyName="Acme Corp"
        unreadCount={0}
      />,
    );

    await user.click(screen.getByTestId("message-employer-button"));
    expect(screen.getByTestId("messaging-drawer")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close drawer" }));
    expect(screen.queryByTestId("messaging-drawer")).not.toBeInTheDocument();
  });
});
