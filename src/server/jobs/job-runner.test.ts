// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockPublish = vi.fn().mockResolvedValue(1);

vi.mock("ioredis", () => {
  const MockRedis = vi.fn().mockImplementation(function (this: {
    publish: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  }) {
    this.publish = mockPublish;
    this.quit = vi.fn().mockResolvedValue("OK");
    this.on = vi.fn();
  });
  return { default: MockRedis };
});

vi.mock("@/env", () => ({
  env: { REDIS_URL: "redis://localhost:6379" },
}));

describe("Job Runner", () => {
  let registerJob: typeof import("./job-runner").registerJob;
  let runJob: typeof import("./job-runner").runJob;
  let runAllDueJobs: typeof import("./job-runner").runAllDueJobs;
  let clearRegistry: typeof import("./job-runner").clearRegistry;
  let getRegisteredJobs: typeof import("./job-runner").getRegisteredJobs;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useRealTimers();

    const mod = await import("./job-runner");
    registerJob = mod.registerJob;
    runJob = mod.runJob;
    runAllDueJobs = mod.runAllDueJobs;
    clearRegistry = mod.clearRegistry;
    getRegisteredJobs = mod.getRegisteredJobs;
    clearRegistry();

    consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("registers a job and lists it", () => {
    registerJob("test-job", async () => {});
    expect(getRegisteredJobs()).toEqual(["test-job"]);
  });

  it("runs a registered job successfully", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerJob("success-job", handler);

    const result = await runJob("success-job");

    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("throws when running an unregistered job", async () => {
    await expect(runJob("nonexistent")).rejects.toThrow('Job "nonexistent" is not registered');
  });

  it("retries a failing job the correct number of times", async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockRejectedValue(new Error("fail"));
    registerJob("retry-job", handler, { retries: 2, backoffMs: 100 });

    const promise = runJob("retry-job");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(false);
    // 1 initial attempt + 2 retries = 3 calls
    expect(handler).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("uses exponential backoff delay between retries", async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockRejectedValue(new Error("fail"));
    registerJob("backoff-timing-job", handler, { retries: 2, backoffMs: 1000 });

    const promise = runJob("backoff-timing-job");

    // 1st attempt fails immediately; waiting for 1st sleep (2^0 * 1000 = 1000ms)
    await vi.advanceTimersByTimeAsync(999);
    expect(handler).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1); // total 1000ms — 1st sleep expires
    expect(handler).toHaveBeenCalledTimes(2);

    // 2nd attempt fails immediately; waiting for 2nd sleep (2^1 * 1000 = 2000ms)
    await vi.advanceTimersByTimeAsync(1999);
    expect(handler).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1); // total 3000ms — 2nd sleep expires
    expect(handler).toHaveBeenCalledTimes(3);

    const result = await promise;
    expect(result).toBe(false);
    vi.useRealTimers();
  });

  it("succeeds on retry after initial failure", async () => {
    const handler = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValue(undefined);
    registerJob("eventual-success", handler, { retries: 2, backoffMs: 10 });

    const result = await runJob("eventual-success");

    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("emits job.failed event via EventBus after all retries exhausted", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("permanent-fail"));
    registerJob("emit-fail", handler, { retries: 0, backoffMs: 10 });

    await runJob("emit-fail");

    expect(mockPublish).toHaveBeenCalledWith(
      "eventbus:job.failed",
      expect.stringContaining("permanent-fail"),
    );
  });

  it("logs structured JSON for job start and complete", async () => {
    registerJob("log-job", async () => {});
    await runJob("log-job");

    const logCalls = consoleSpy.mock.calls.map((c) => JSON.parse(c[0] as string));
    const startLog = logCalls.find((l) => l.message === "job.start");
    const completeLog = logCalls.find((l) => l.message === "job.complete");

    expect(startLog).toBeDefined();
    expect(startLog.jobName).toBe("log-job");
    expect(startLog.level).toBe("info");
    expect(startLog.timestamp).toBeDefined();

    expect(completeLog).toBeDefined();
    expect(completeLog.jobName).toBe("log-job");
    expect(completeLog.duration).toBeGreaterThanOrEqual(0);
  });

  it("logs structured JSON for job failure to stderr", async () => {
    registerJob(
      "fail-log",
      async () => {
        throw new Error("boom");
      },
      { retries: 0, backoffMs: 10 },
    );
    await runJob("fail-log");

    const errorLogCalls = consoleErrorSpy.mock.calls.map((c) => JSON.parse(c[0] as string));
    const failLog = errorLogCalls.find((l) => l.message === "job.failed");

    expect(failLog).toBeDefined();
    expect(failLog.level).toBe("error");
    expect(failLog.jobName).toBe("fail-log");
    expect(failLog.error).toBe("boom");
    expect(failLog.attempts).toBe(1);
  });

  it("runAllDueJobs runs all registered jobs", async () => {
    const handler1 = vi.fn().mockResolvedValue(undefined);
    const handler2 = vi.fn().mockResolvedValue(undefined);
    registerJob("job-a", handler1);
    registerJob("job-b", handler2);

    const result = await runAllDueJobs();

    expect(result).toBe(true);
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it("runAllDueJobs continues even if one job fails", async () => {
    const failHandler = vi.fn().mockRejectedValue(new Error("fail"));
    const successHandler = vi.fn().mockResolvedValue(undefined);
    registerJob("fail-job", failHandler, { retries: 0, backoffMs: 10 });
    registerJob("success-job", successHandler);

    const result = await runAllDueJobs();

    expect(result).toBe(false);
    expect(failHandler).toHaveBeenCalledTimes(1);
    expect(successHandler).toHaveBeenCalledTimes(1);
  });

  it("respects timeout option", async () => {
    vi.useFakeTimers();
    const handler = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 5000)));
    registerJob("timeout-job", handler, { retries: 0, backoffMs: 0, timeoutMs: 50 });

    const promise = runJob("timeout-job");
    await vi.advanceTimersByTimeAsync(51); // past the 50ms timeout
    const result = await promise;

    expect(result).toBe(false);
    vi.useRealTimers();
  });

  it("clearRegistry removes all registered jobs", () => {
    registerJob("temp", async () => {});
    clearRegistry();
    expect(getRegisteredJobs()).toEqual([]);
  });
});
