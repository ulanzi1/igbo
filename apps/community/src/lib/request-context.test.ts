// @vitest-environment node
import { describe, it, expect } from "vitest";
import { requestContext, getRequestContext, runWithContext } from "./request-context";

describe("request-context", () => {
  it("exports an AsyncLocalStorage instance", () => {
    expect(requestContext).toBeDefined();
    expect(requestContext.getStore).toBeDefined();
  });

  it("returns undefined when no context is active", () => {
    const ctx = getRequestContext();
    expect(ctx).toBeUndefined();
  });

  it("provides context within runWithContext", async () => {
    const result = await runWithContext({ traceId: "test-trace-123" }, () => {
      const ctx = getRequestContext();
      return ctx?.traceId;
    });

    expect(result).toBe("test-trace-123");
  });

  it("supports optional userId", async () => {
    const result = await runWithContext({ traceId: "trace-456", userId: "user-789" }, () => {
      const ctx = getRequestContext();
      return ctx;
    });

    expect(result).toEqual({
      traceId: "trace-456",
      userId: "user-789",
    });
  });

  it("propagates context through async call chains", async () => {
    const result = await runWithContext({ traceId: "async-trace" }, async () => {
      // Simulate async operations
      await new Promise((resolve) => setTimeout(resolve, 10));
      const ctx = getRequestContext();
      return ctx?.traceId;
    });

    expect(result).toBe("async-trace");
  });

  it("isolates context between concurrent runs", async () => {
    const results = await Promise.all([
      runWithContext({ traceId: "run-1" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return getRequestContext()?.traceId;
      }),
      runWithContext({ traceId: "run-2" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return getRequestContext()?.traceId;
      }),
    ]);

    expect(results).toEqual(["run-1", "run-2"]);
  });
});
