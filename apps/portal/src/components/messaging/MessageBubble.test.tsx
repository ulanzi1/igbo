// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = { download: "Download" };
    return map[key] ?? key;
  },
}));

vi.mock("@/providers/density-context", () => ({
  useDensity: () => ({ density: "comfortable", setDensity: () => undefined }),
  DensityProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ROLE_DENSITY_DEFAULTS: {},
}));

import { MessageBubble, formatFileSize } from "./MessageBubble";
import type { PortalMessage, MessageAttachment } from "@/hooks/use-portal-messages";

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

// ── MessageBubble — attachments ───────────────────────────────────────────────

describe("MessageBubble — attachments", () => {
  const pdfAttachment: MessageAttachment = {
    id: "att-1",
    fileUrl: "https://test-bucket.example.com/portal/messages/user/uuid.pdf",
    fileName: "resume.pdf",
    fileType: "application/pdf",
    fileSize: 12345,
  };

  const imageAttachment: MessageAttachment = {
    id: "att-2",
    fileUrl: "https://test-bucket.example.com/portal/messages/user/photo.png",
    fileName: "photo.png",
    fileType: "image/png",
    fileSize: 5678,
  };

  it("renders attachment list for non-image files", () => {
    const msg = { ...baseMsg, _attachments: [pdfAttachment] };
    render(<MessageBubble message={msg} isSelf={true} />);
    expect(screen.getByRole("list")).toBeDefined();
    expect(screen.getByText("resume.pdf")).toBeDefined();
    expect(screen.getByText("PDF")).toBeDefined();
  });

  it("renders download link pointing to download route", () => {
    const msg = { ...baseMsg, _attachments: [pdfAttachment] };
    render(<MessageBubble message={msg} isSelf={true} />);
    const links = screen.getAllByRole("link");
    const downloadLink = links.find((l) => l.getAttribute("href")?.includes("att-1"));
    expect(downloadLink?.getAttribute("href")).toBe("/api/v1/upload/download/att-1");
  });

  it("renders image thumbnail for image attachments", () => {
    const msg = { ...baseMsg, _attachments: [imageAttachment] };
    const { container } = render(<MessageBubble message={msg} isSelf={true} />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(imageAttachment.fileUrl);
    expect(img?.getAttribute("alt")).toBe("photo.png");
  });

  it("renders nothing for _attachments when array is empty", () => {
    const msg = { ...baseMsg, _attachments: [] };
    render(<MessageBubble message={msg} isSelf={true} />);
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("renders no attachment list when _attachments is undefined", () => {
    render(<MessageBubble message={baseMsg} isSelf={true} />);
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("shows DOC label for .docx files", () => {
    const docx: MessageAttachment = {
      ...pdfAttachment,
      id: "att-3",
      fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: "cover-letter.docx",
    };
    const msg = { ...baseMsg, _attachments: [docx] };
    render(<MessageBubble message={msg} isSelf={true} />);
    expect(screen.getByText("DOC")).toBeDefined();
  });

  it("shows TXT label for text/plain files", () => {
    const txt: MessageAttachment = {
      ...pdfAttachment,
      id: "att-4",
      fileType: "text/plain",
      fileName: "notes.txt",
    };
    const msg = { ...baseMsg, _attachments: [txt] };
    render(<MessageBubble message={msg} isSelf={true} />);
    expect(screen.getByText("TXT")).toBeDefined();
  });

  it("renders multiple attachments", () => {
    const msg = { ...baseMsg, _attachments: [pdfAttachment, imageAttachment] };
    render(<MessageBubble message={msg} isSelf={true} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});

// ── formatFileSize ─────────────────────────────────────────────────────────────

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(512)).toBe("512 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("returns '0 B' for null or 0", () => {
    expect(formatFileSize(null)).toBe("0 B");
    expect(formatFileSize(0)).toBe("0 B");
  });
});
