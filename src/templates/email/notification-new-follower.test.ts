// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "./notification-new-follower";

describe("notification-new-follower email template", () => {
  const data = {
    name: "Obiageli",
    followerName: "Ikechukwu",
    profileUrl: "/profile/ikechukwu",
  };

  it("renders EN HTML with follower name, profile URL, and unsubscribe link", () => {
    const result = render(data, "en");
    expect(result.subject).toContain("following");
    expect(result.html).toContain("Ikechukwu");
    expect(result.html).toContain("/profile/ikechukwu");
    expect(result.html).toContain("settings/notifications");
  });

  it("renders IG HTML with follower name, profile URL, and unsubscribe link", () => {
    const result = render(data, "ig");
    expect(result.subject).toBeTruthy();
    expect(result.html).toContain("Ikechukwu");
    expect(result.html).toContain("/profile/ikechukwu");
    expect(result.html).toContain("settings/notifications");
  });

  it("unsubscribe link points to /settings/notifications", () => {
    const result = render(data, "en");
    expect(result.html).toContain('href="/settings/notifications"');
  });

  it("recipient name is included in greeting", () => {
    const result = render(data, "en");
    expect(result.html).toContain("Obiageli");
  });
});
