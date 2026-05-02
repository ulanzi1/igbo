// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  portalNotifications,
  type PortalNotification,
  type NewPortalNotification,
} from "./portal-notifications";

describe("portalNotifications schema", () => {
  it("has the three required indexes (drift-guard)", () => {
    const { indexes } = getTableConfig(portalNotifications);
    const names = indexes.map((idx) => idx.config.name);
    expect(names).toContain("idx_portal_notifications_user_read_created");
    expect(names).toContain("idx_portal_notifications_user_dismissed");
    expect(names).toContain("idx_portal_notifications_idempotency_key");
  });

  it("has all required columns", () => {
    const cols = Object.keys(portalNotifications);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("eventType");
    expect(cols).toContain("title");
    expect(cols).toContain("body");
    expect(cols).toContain("link");
    expect(cols).toContain("payloadJson");
    expect(cols).toContain("readAt");
    expect(cols).toContain("dismissedAt");
    expect(cols).toContain("idempotencyKey");
    expect(cols).toContain("createdAt");
  });

  it("exports PortalNotification select type with all fields", () => {
    const _check: PortalNotification = {
      id: "uuid-1",
      userId: "uuid-2",
      eventType: "portal.application.submitted",
      title: "New Application",
      body: "You received a new application",
      link: "/applications/123",
      payloadJson: { foo: "bar" },
      readAt: null,
      dismissedAt: null,
      idempotencyKey: "dedup-key-1",
      createdAt: new Date(),
    };
    expect(_check.id).toBe("uuid-1");
    expect(_check.eventType).toBe("portal.application.submitted");
    expect(_check.readAt).toBeNull();
    expect(_check.dismissedAt).toBeNull();
  });

  it("exports NewPortalNotification insert type with required and optional fields", () => {
    const _check: NewPortalNotification = {
      userId: "uuid-2",
      eventType: "portal.job.approved",
      title: "Job Approved",
      body: "Your job posting has been approved",
    };
    expect(_check.eventType).toBe("portal.job.approved");
    // Optional fields should not be required
    expect(_check.link).toBeUndefined();
    expect(_check.readAt).toBeUndefined();
    expect(_check.dismissedAt).toBeUndefined();
    expect(_check.idempotencyKey).toBeUndefined();
  });
});
