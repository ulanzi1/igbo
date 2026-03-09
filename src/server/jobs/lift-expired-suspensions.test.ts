// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockLiftExpiredSuspensions = vi.hoisted(() => vi.fn());
const mockRegisterJob = vi.hoisted(() => vi.fn());

vi.mock("@/services/member-discipline-service", () => ({
  liftExpiredSuspensions: mockLiftExpiredSuspensions,
}));

vi.mock("@/server/jobs/job-runner", () => ({
  registerJob: mockRegisterJob,
}));

describe("lift-expired-suspensions job", () => {
  let registeredHandler: ((now?: Date) => Promise<void>) | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLiftExpiredSuspensions.mockResolvedValue(0);
    // Import module to trigger job registration
    vi.resetModules();
    mockRegisterJob.mockImplementation((_name: string, fn: () => Promise<void>) => {
      registeredHandler = fn;
    });
    // Re-import after resetting to capture handler
    await import("./lift-expired-suspensions");
  });

  it("registers a job named 'lift-expired-suspensions'", () => {
    expect(mockRegisterJob).toHaveBeenCalledWith("lift-expired-suspensions", expect.any(Function));
  });

  it("calls liftExpiredSuspensions with current date when job runs", async () => {
    mockLiftExpiredSuspensions.mockResolvedValue(3);
    await registeredHandler?.();
    expect(mockLiftExpiredSuspensions).toHaveBeenCalledWith(expect.any(Date));
  });

  it("runs without error when no suspensions are expiring", async () => {
    mockLiftExpiredSuspensions.mockResolvedValue(0);
    await expect(registeredHandler?.()).resolves.not.toThrow();
  });

  it("runs without error when suspensions are lifted", async () => {
    mockLiftExpiredSuspensions.mockResolvedValue(5);
    await expect(registeredHandler?.()).resolves.not.toThrow();
  });
});
