// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "./notification-first-dm";

describe("notification-first-dm email template", () => {
  const data = {
    name: "Adaeze",
    senderName: "Emeka",
    messagePreview: "Hello! Are you coming to the event?",
    chatUrl: "/chat/conv-abc-123",
  };

  it("renders EN HTML with sender name, message preview, chat URL, and unsubscribe link", () => {
    const result = render(data, "en");
    expect(result.subject).toContain("message");
    expect(result.html).toContain("Emeka");
    expect(result.html).toContain("Hello! Are you coming to the event?");
    expect(result.html).toContain("/chat/conv-abc-123");
    expect(result.html).toContain("settings/notifications");
  });

  it("renders IG HTML with sender name, message preview, and unsubscribe link", () => {
    const result = render(data, "ig");
    expect(result.subject).toBeTruthy();
    expect(result.html).toContain("Emeka");
    expect(result.html).toContain("Hello! Are you coming to the event?");
    expect(result.html).toContain("settings/notifications");
  });

  it("message preview is HTML-escaped (XSS prevention)", () => {
    const xssData = {
      ...data,
      messagePreview: '<script>alert("xss")</script>',
    };
    const result = render(xssData, "en");
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
  });

  it("unsubscribe link points to /settings/notifications", () => {
    const result = render(data, "en");
    expect(result.html).toContain('href="/settings/notifications"');
  });

  it("recipient name is included in greeting", () => {
    const result = render(data, "en");
    expect(result.html).toContain("Adaeze");
  });
});
