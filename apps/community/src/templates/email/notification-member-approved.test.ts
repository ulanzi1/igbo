// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "./notification-member-approved";

describe("notification-member-approved email template", () => {
  const data = { name: "Ngozi" };

  it("renders EN HTML with name and unsubscribe link", () => {
    const result = render(data, "en");
    expect(result.subject).toContain("approved");
    expect(result.html).toContain("Ngozi");
    expect(result.html).toContain("settings/notifications");
    expect(result.html).toContain("/dashboard");
  });

  it("renders IG HTML with name and unsubscribe link", () => {
    const result = render(data, "ig");
    expect(result.subject).toBeTruthy();
    expect(result.html).toContain("Ngozi");
    expect(result.html).toContain("settings/notifications");
  });

  it("unsubscribe link points to /settings/notifications", () => {
    const result = render(data, "en");
    expect(result.html).toContain('href="/settings/notifications"');
  });
});
