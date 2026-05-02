// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "../index";

vi.mock("../index", () => ({
  db: {
    select: vi.fn(),
    execute: vi.fn(),
  },
}));

const mockDb = vi.mocked(db);

describe("portal-application-views queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordApplicationViewRow", () => {
    it("returns isFirstView=true when a new row is inserted (count=1)", async () => {
      const { recordApplicationViewRow } = await import("./portal-application-views");
      const tx = { execute: vi.fn().mockResolvedValue({ count: 1 }) };
      const result = await recordApplicationViewRow(tx as any, "app-1", "employer-1");
      expect(result.isFirstView).toBe(true);
    });

    it("returns isFirstView=false on duplicate (ON CONFLICT DO NOTHING, count=0)", async () => {
      const { recordApplicationViewRow } = await import("./portal-application-views");
      const tx = { execute: vi.fn().mockResolvedValue({ count: 0 }) };
      const result = await recordApplicationViewRow(tx as any, "app-1", "employer-1");
      expect(result.isFirstView).toBe(false);
    });
  });

  describe("getApplicationViewedAt", () => {
    it("returns viewed_at date when present", async () => {
      const { getApplicationViewedAt } = await import("./portal-application-views");
      const viewedAt = new Date("2026-05-01T10:00:00Z");
      const where = vi.fn().mockResolvedValue([{ viewedAt }]);
      const from = vi.fn().mockReturnValue({ where });
      const select = vi.fn().mockReturnValue({ from });
      mockDb.select.mockImplementation(select as any);
      const result = await getApplicationViewedAt("app-1");
      expect(result).toEqual(viewedAt);
    });

    it("returns null when not yet viewed", async () => {
      const { getApplicationViewedAt } = await import("./portal-application-views");
      const where = vi.fn().mockResolvedValue([{ viewedAt: null }]);
      const from = vi.fn().mockReturnValue({ where });
      const select = vi.fn().mockReturnValue({ from });
      mockDb.select.mockImplementation(select as any);
      const result = await getApplicationViewedAt("app-1");
      expect(result).toBeNull();
    });

    it("returns null when application not found", async () => {
      const { getApplicationViewedAt } = await import("./portal-application-views");
      const where = vi.fn().mockResolvedValue([]);
      const from = vi.fn().mockReturnValue({ where });
      const select = vi.fn().mockReturnValue({ from });
      mockDb.select.mockImplementation(select as any);
      const result = await getApplicationViewedAt("app-999");
      expect(result).toBeNull();
    });
  });

  describe("hasEmployerViewedApplication", () => {
    it("returns true when employer has viewed the application", async () => {
      const { hasEmployerViewedApplication } = await import("./portal-application-views");
      const limit = vi.fn().mockResolvedValue([{ applicationId: "app-1" }]);
      const where = vi.fn().mockReturnValue({ limit });
      const from = vi.fn().mockReturnValue({ where });
      const select = vi.fn().mockReturnValue({ from });
      mockDb.select.mockImplementation(select as any);
      const result = await hasEmployerViewedApplication("app-1", "employer-1");
      expect(result).toBe(true);
    });

    it("returns false when employer has not viewed the application", async () => {
      const { hasEmployerViewedApplication } = await import("./portal-application-views");
      const limit = vi.fn().mockResolvedValue([]);
      const where = vi.fn().mockReturnValue({ limit });
      const from = vi.fn().mockReturnValue({ where });
      const select = vi.fn().mockReturnValue({ from });
      mockDb.select.mockImplementation(select as any);
      const result = await hasEmployerViewedApplication("app-1", "employer-2");
      expect(result).toBe(false);
    });
  });
});
