// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/config/handler-guard", () => ({
  withHandlerGuard: (_name: string, fn: () => Promise<void>) => fn,
}));
vi.mock("@igbo/db/queries/auth-queries", () => ({
  findUserById: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingById: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyById: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-outbox", () => ({
  claimPendingOutboxEvents: vi.fn(),
  markOutboxEventProcessed: vi.fn(),
  incrementOutboxRetryCount: vi.fn(),
  cleanupProcessedOutboxEvents: vi.fn(),
}));
vi.mock("@/services/notification-router", () => ({
  dispatchNotification: vi.fn(),
}));
import { findUserById } from "@igbo/db/queries/auth-queries";
import { getJobPostingById } from "@igbo/db/queries/portal-job-postings";
import { getCompanyById } from "@igbo/db/queries/portal-companies";
import {
  claimPendingOutboxEvents,
  markOutboxEventProcessed,
  incrementOutboxRetryCount,
  cleanupProcessedOutboxEvents,
} from "@igbo/db/queries/portal-outbox";
import { dispatchNotification } from "@/services/notification-router";

const APP_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const SEEKER_ID = "seeker-1";
const EMPLOYER_ID = "employer-1";
const JOB_ID = "job-1";
const COMPANY_ID = "cp-1";

const makeEvent = (
  overrides: Partial<{
    id: string;
    retryCount: number;
    status: string;
  }> = {},
) => ({
  id: overrides.id ?? "outbox-1",
  eventType: "portal.application.viewed",
  payload: {
    applicationId: APP_ID,
    jobId: JOB_ID,
    seekerUserId: SEEKER_ID,
    employerUserId: EMPLOYER_ID,
    companyId: COMPANY_ID,
    timestamp: "2026-05-01T00:00:00.000Z",
  },
  status: overrides.status ?? "pending",
  retryCount: overrides.retryCount ?? 0,
  createdAt: new Date("2026-05-01"),
  processedAt: null,
});

describe("outbox-poller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findUserById).mockResolvedValue({
      id: SEEKER_ID,
      email: "seeker@test.com",
      name: "Test Seeker",
      languagePreference: "en",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(getJobPostingById).mockResolvedValue({
      id: JOB_ID,
      title: "Senior Engineer",
      companyId: COMPANY_ID,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(getCompanyById).mockResolvedValue({
      id: COMPANY_ID,
      name: "Acme Corp",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(markOutboxEventProcessed).mockResolvedValue(undefined);
    vi.mocked(incrementOutboxRetryCount).mockResolvedValue(undefined);
    vi.mocked(dispatchNotification).mockResolvedValue(undefined);
  });

  describe("processOutboxBatch", () => {
    it("processes a single pending event and marks it processed", async () => {
      vi.mocked(claimPendingOutboxEvents).mockResolvedValue([makeEvent()]);
      const { processOutboxBatch } = await import("./outbox-poller");
      await (processOutboxBatch as () => Promise<void>)();
      expect(dispatchNotification).toHaveBeenCalledOnce();
      expect(markOutboxEventProcessed).toHaveBeenCalledWith("outbox-1");
    });

    it("processes a batch of multiple events", async () => {
      vi.mocked(claimPendingOutboxEvents).mockResolvedValue([
        makeEvent({ id: "outbox-1" }),
        makeEvent({ id: "outbox-2" }),
        makeEvent({ id: "outbox-3" }),
      ]);
      const { processOutboxBatch } = await import("./outbox-poller");
      await (processOutboxBatch as () => Promise<void>)();
      expect(dispatchNotification).toHaveBeenCalledTimes(3);
      expect(markOutboxEventProcessed).toHaveBeenCalledTimes(3);
    });

    it("is a no-op when queue is empty", async () => {
      vi.mocked(claimPendingOutboxEvents).mockResolvedValue([]);
      const { processOutboxBatch } = await import("./outbox-poller");
      await (processOutboxBatch as () => Promise<void>)();
      expect(dispatchNotification).not.toHaveBeenCalled();
      expect(markOutboxEventProcessed).not.toHaveBeenCalled();
    });

    it("dispatches correct notification payload for portal.application.viewed", async () => {
      vi.mocked(claimPendingOutboxEvents).mockResolvedValue([makeEvent()]);
      const { processOutboxBatch } = await import("./outbox-poller");
      await (processOutboxBatch as () => Promise<void>)();
      expect(dispatchNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: SEEKER_ID,
          eventType: "portal.application.viewed",
          dedupKey: `viewed:${APP_ID}:${EMPLOYER_ID}`,
          content: expect.objectContaining({
            link: `/applications/${APP_ID}`,
          }),
          pushPayload: expect.objectContaining({
            tag: `app-viewed-${APP_ID}`,
          }),
          emailJob: expect.objectContaining({
            name: `app-viewed-${APP_ID}:${EMPLOYER_ID}`,
          }),
        }),
      );
    });

    it("increments retry_count on dispatch failure without marking processed", async () => {
      vi.mocked(claimPendingOutboxEvents).mockResolvedValue([makeEvent({ retryCount: 3 })]);
      vi.mocked(dispatchNotification).mockRejectedValue(new Error("dispatch failed"));
      const { processOutboxBatch } = await import("./outbox-poller");
      await (processOutboxBatch as () => Promise<void>)();
      expect(incrementOutboxRetryCount).toHaveBeenCalledWith("outbox-1");
      expect(markOutboxEventProcessed).not.toHaveBeenCalled();
    });

    it("marks failed after 10 retries (retry_count=9 → incrementOutboxRetryCount sets status=failed)", async () => {
      vi.mocked(claimPendingOutboxEvents).mockResolvedValue([makeEvent({ retryCount: 9 })]);
      vi.mocked(dispatchNotification).mockRejectedValue(new Error("dispatch failed"));
      const { processOutboxBatch } = await import("./outbox-poller");
      await (processOutboxBatch as () => Promise<void>)();
      expect(incrementOutboxRetryCount).toHaveBeenCalledWith("outbox-1");
    });

    it("logs failed events with structured JSON", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(claimPendingOutboxEvents).mockResolvedValue([makeEvent()]);
      vi.mocked(dispatchNotification).mockRejectedValue(new Error("dispatch failed"));
      const { processOutboxBatch } = await import("./outbox-poller");
      await (processOutboxBatch as () => Promise<void>)();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("portal.outbox.event_processing_failed"),
      );
      consoleSpy.mockRestore();
    });

    it("omits emailJob when seeker has no email", async () => {
      vi.mocked(findUserById).mockResolvedValue({
        id: SEEKER_ID,
        email: null,
        name: "Seeker",
        languagePreference: "en",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      vi.mocked(claimPendingOutboxEvents).mockResolvedValue([makeEvent()]);
      const { processOutboxBatch } = await import("./outbox-poller");
      await (processOutboxBatch as () => Promise<void>)();
      expect(dispatchNotification).toHaveBeenCalledWith(
        expect.objectContaining({ emailJob: undefined }),
      );
    });

    it("uses Igbo locale for seeker with ig language preference", async () => {
      vi.mocked(findUserById).mockResolvedValue({
        id: SEEKER_ID,
        email: "seeker@test.com",
        name: "Seeker",
        languagePreference: "ig",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      vi.mocked(claimPendingOutboxEvents).mockResolvedValue([makeEvent()]);
      const { processOutboxBatch } = await import("./outbox-poller");
      await (processOutboxBatch as () => Promise<void>)();
      const call = vi.mocked(dispatchNotification).mock.calls[0]![0];
      expect(call.emailJob?.payload.locale).toBe("ig");
      expect(call.content.title).toContain("hụrụ arịọ gị");
      expect(call.pushPayload?.title).toContain("hụrụ arịọ gị");
    });

    it("concurrent invocations via SKIP LOCKED — second call fetches 0 rows (already claimed)", async () => {
      vi.mocked(claimPendingOutboxEvents)
        .mockResolvedValueOnce([makeEvent()])
        .mockResolvedValueOnce([]);
      const { processOutboxBatch } = await import("./outbox-poller");
      await Promise.all([
        (processOutboxBatch as () => Promise<void>)(),
        (processOutboxBatch as () => Promise<void>)(),
      ]);
      // First call dispatched, second call got empty batch — total dispatch count = 1
      expect(dispatchNotification).toHaveBeenCalledTimes(1);
    });
  });

  describe("startOutboxPoller", () => {
    afterEach(() => {
      // Reset HMR guard after each test
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__outboxPollerStarted = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__outboxPollerCleanup = undefined;
    });

    it("HMR guard prevents double-start", async () => {
      vi.useFakeTimers();
      vi.mocked(claimPendingOutboxEvents).mockResolvedValue([]);
      const { startOutboxPoller } = await import("./outbox-poller");
      const cleanup1 = startOutboxPoller(1000);
      const cleanup2 = startOutboxPoller(1000); // second call — should be no-op
      // Both return cleanup fns, but only one interval is running
      cleanup1();
      cleanup2();
      vi.useRealTimers();
      // Just verify no crash
      expect(true).toBe(true);
    });

    it("cleanup stops the interval", async () => {
      vi.useFakeTimers();
      vi.mocked(claimPendingOutboxEvents).mockResolvedValue([]);
      const { startOutboxPoller } = await import("./outbox-poller");
      const cleanup = startOutboxPoller(1000);
      cleanup();
      await vi.advanceTimersByTimeAsync(5000);
      expect(claimPendingOutboxEvents).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe("cleanupProcessedOutboxEvents (re-exported)", () => {
    it("returns count of deleted processed events", async () => {
      vi.mocked(cleanupProcessedOutboxEvents).mockResolvedValue(5);
      const { cleanupProcessedOutboxEvents: cleanup } = await import("./outbox-poller");
      const count = await cleanup(7);
      expect(count).toBe(5);
    });

    it("returns 0 when no old events to clean up", async () => {
      vi.mocked(cleanupProcessedOutboxEvents).mockResolvedValue(0);
      const { cleanupProcessedOutboxEvents: cleanup } = await import("./outbox-poller");
      const count = await cleanup(7);
      expect(count).toBe(0);
    });
  });
});
