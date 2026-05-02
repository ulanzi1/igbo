// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "../index";

vi.mock("../index", () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  },
}));

const mockDb = vi.mocked(db);

// Helper for chained insert (tx)
function makeTx() {
  const returning = vi.fn().mockResolvedValue([
    {
      id: "outbox-1",
      eventType: "portal.application.viewed",
      payload: { applicationId: "app-1" },
      status: "pending",
      retryCount: 0,
      createdAt: new Date("2026-01-01"),
      processedAt: null,
    },
  ]);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });
  const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  const update = vi.fn().mockReturnValue({ set: updateSet });
  const execute = vi.fn().mockResolvedValue({ count: 0 });
  return { insert, update, execute };
}

describe("portal-outbox queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("insertOutboxEvent", () => {
    it("inserts outbox event within a transaction and returns the row", async () => {
      const { insertOutboxEvent } = await import("./portal-outbox");
      const tx = makeTx();
      const result = await insertOutboxEvent(tx as any, "portal.application.viewed", {
        applicationId: "app-1",
        seekerUserId: "seeker-1",
      });
      expect(tx.insert).toHaveBeenCalled();
      expect(result.eventType).toBe("portal.application.viewed");
      expect(result.status).toBe("pending");
    });

    it("throws if insert returns empty array", async () => {
      const { insertOutboxEvent } = await import("./portal-outbox");
      const tx = makeTx();
      const returning = vi.fn().mockResolvedValue([]);
      const values = vi.fn().mockReturnValue({ returning });
      tx.insert.mockReturnValue({ values } as any);
      await expect(insertOutboxEvent(tx as any, "portal.application.viewed", {})).rejects.toThrow(
        "Failed to insert outbox event",
      );
    });
  });

  describe("claimPendingOutboxEvents", () => {
    it("atomically claims rows and maps snake_case to camelCase", async () => {
      const { claimPendingOutboxEvents } = await import("./portal-outbox");
      const fakeRow = {
        id: "outbox-1",
        event_type: "portal.application.viewed",
        payload: { applicationId: "app-1" },
        status: "processing",
        retry_count: 0,
        created_at: new Date("2026-01-01"),
        processed_at: null,
      };
      mockDb.execute.mockResolvedValue([fakeRow] as any);
      const events = await claimPendingOutboxEvents(10);
      expect(events).toHaveLength(1);
      expect(events[0]!.eventType).toBe("portal.application.viewed");
      expect(events[0]!.retryCount).toBe(0);
      expect(events[0]!.processedAt).toBeNull();
    });

    it("returns empty array when no pending events", async () => {
      const { claimPendingOutboxEvents } = await import("./portal-outbox");
      mockDb.execute.mockResolvedValue([] as any);
      const events = await claimPendingOutboxEvents();
      expect(events).toHaveLength(0);
    });
  });

  describe("markOutboxEventProcessed", () => {
    it("updates status to processed and sets processedAt", async () => {
      const { markOutboxEventProcessed } = await import("./portal-outbox");
      const where = vi.fn().mockResolvedValue(undefined);
      const set = vi.fn().mockReturnValue({ where });
      mockDb.update.mockReturnValue({ set } as any);
      await markOutboxEventProcessed("outbox-1");
      expect(mockDb.update).toHaveBeenCalled();
      expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: "processed" }));
    });
  });

  describe("incrementOutboxRetryCount", () => {
    it("executes atomic SQL increment", async () => {
      const { incrementOutboxRetryCount } = await import("./portal-outbox");
      mockDb.execute.mockResolvedValue([] as any);
      await incrementOutboxRetryCount("outbox-1");
      expect(mockDb.execute).toHaveBeenCalled();
    });
  });

  describe("cleanupProcessedOutboxEvents", () => {
    it("returns count of deleted rows", async () => {
      const { cleanupProcessedOutboxEvents } = await import("./portal-outbox");
      mockDb.execute.mockResolvedValue({ count: 5 } as any);
      const count = await cleanupProcessedOutboxEvents(7);
      expect(count).toBe(5);
    });

    it("returns 0 when no old events to delete", async () => {
      const { cleanupProcessedOutboxEvents } = await import("./portal-outbox");
      mockDb.execute.mockResolvedValue({ count: 0 } as any);
      const count = await cleanupProcessedOutboxEvents(7);
      expect(count).toBe(0);
    });
  });
});
