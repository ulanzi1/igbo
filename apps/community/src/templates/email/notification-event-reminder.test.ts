// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "./notification-event-reminder";

describe("notification-event-reminder email template", () => {
  const data = {
    name: "Chidi",
    eventTitle: "Igbo Language Class",
    startTime: "2026-03-15T14:00:00Z",
    eventUrl: "/events/abc-123",
  };

  it("renders EN HTML with event title, start time, event URL, and unsubscribe link", () => {
    const result = render(data, "en");
    expect(result.subject).toContain("upcoming event");
    expect(result.html).toContain("Igbo Language Class");
    expect(result.html).toContain("/events/abc-123");
    expect(result.html).toContain("settings/notifications");
    expect(result.html).toContain("2026-03-15T14:00:00Z");
  });

  it("renders IG HTML with Igbo copy and event data", () => {
    const result = render(data, "ig");
    expect(result.subject).toBeTruthy();
    expect(result.html).toContain("Igbo Language Class");
    expect(result.html).toContain("/events/abc-123");
    expect(result.html).toContain("settings/notifications");
  });

  it("renders plain text with all data", () => {
    const result = render(data, "en");
    expect(result.text).toContain("Igbo Language Class");
    expect(result.text).toContain("/events/abc-123");
    expect(result.text).toContain("2026-03-15T14:00:00Z");
  });

  it("unsubscribe link points to /settings/notifications", () => {
    const result = render(data, "en");
    expect(result.html).toContain('href="/settings/notifications"');
  });

  it("recipient name is included in greeting", () => {
    const result = render(data, "en");
    expect(result.html).toContain("Chidi");
  });
});
