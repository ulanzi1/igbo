// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/providers/density-context", () => ({
  useDensity: () => ({ density: "comfortable", setDensity: () => undefined }),
  DensityProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ROLE_DENSITY_DEFAULTS: {},
}));

import { MessageBubble } from "./MessageBubble";
import type { PortalMessage } from "@/hooks/use-portal-messages";

const baseMsg: PortalMessage = {
  id: "msg-1",
  conversationId: "conv-1",
  senderId: "user-1",
  content: "Hello world",
  contentType: "text",
  parentMessageId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: "2026-04-23T10:00:00.000Z",
};

describe("MessageBubble", () => {
  it("renders message content", () => {
    const { getByText } = render(<MessageBubble message={baseMsg} isSelf={true} />);
    expect(getByText("Hello world")).toBeDefined();
  });

  it("aligns self messages to the right", () => {
    const { getByTestId } = render(<MessageBubble message={baseMsg} isSelf={true} />);
    expect(getByTestId("message-bubble").getAttribute("data-self")).toBe("true");
  });

  it("aligns received messages to the left", () => {
    const { getByTestId } = render(<MessageBubble message={baseMsg} isSelf={false} />);
    expect(getByTestId("message-bubble").getAttribute("data-self")).toBe("false");
  });

  it("shows sender name for received messages", () => {
    const { getByText } = render(
      <MessageBubble message={baseMsg} isSelf={false} senderName="Alice" />,
    );
    expect(getByText("Alice")).toBeDefined();
  });

  it("does not show sender name for self messages", () => {
    const { queryByText } = render(
      <MessageBubble message={baseMsg} isSelf={true} senderName="Alice" />,
    );
    expect(queryByText("Alice")).toBeNull();
  });

  it("renders timestamp", () => {
    const { getByRole } = render(<MessageBubble message={baseMsg} isSelf={true} />);
    expect(getByRole("time")).toBeDefined();
  });

  it("shows sent checkmark for sent status", () => {
    const msg = { ...baseMsg, _status: "sent" as const };
    const { getByText } = render(<MessageBubble message={msg} isSelf={true} />);
    expect(getByText("✓")).toBeDefined();
  });

  it("shows double checkmark for delivered status", () => {
    const msg = { ...baseMsg, _status: "delivered" as const };
    const { getByText } = render(<MessageBubble message={msg} isSelf={true} />);
    expect(getByText("✓✓")).toBeDefined();
  });

  it("shows failure icon for failed status", () => {
    const msg = { ...baseMsg, _status: "failed" as const };
    const { getByText } = render(<MessageBubble message={msg} isSelf={true} />);
    expect(getByText("✗")).toBeDefined();
  });

  it("shows read status with correct aria-label", () => {
    const msg = { ...baseMsg, _status: "read" as const };
    const { getByText, getByLabelText } = render(<MessageBubble message={msg} isSelf={true} />);
    // Status icon renders ✓✓ (same visual as delivered but font-medium)
    expect(getByText("✓✓")).toBeDefined();
    // aria-label contains the i18n key path
    expect(getByLabelText("status.read")).toBeDefined();
  });

  it("preserves whitespace in message content", () => {
    const msg = { ...baseMsg, content: "Line 1\nLine 2" };
    const { container } = render(<MessageBubble message={msg} isSelf={true} />);
    const p = container.querySelector("p");
    expect(p?.className).toContain("whitespace-pre-wrap");
    expect(p?.textContent).toBe("Line 1\nLine 2");
  });
});
