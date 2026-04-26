import { describe, it, expect, vi } from "vitest";
import { withHandlerGuard } from "./handler-guard";

describe("withHandlerGuard", () => {
  it("calls the inner function with all arguments", async () => {
    const inner = vi.fn().mockResolvedValue("result");
    const guarded = withHandlerGuard("test:handler", inner);
    await guarded("arg1", "arg2");
    expect(inner).toHaveBeenCalledWith("arg1", "arg2");
  });

  it("returns the inner function result on success", async () => {
    const inner = vi.fn().mockResolvedValue("ok");
    const guarded = withHandlerGuard("test:handler", inner);
    const result = await guarded();
    expect(result).toBe("ok");
  });

  it("catches errors and does not re-throw", async () => {
    const inner = vi.fn().mockRejectedValue(new Error("boom"));
    const guarded = withHandlerGuard("test:handler", inner);
    await expect(guarded()).resolves.toBeUndefined();
  });

  it("logs structured error JSON on failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const inner = vi.fn().mockRejectedValue(new Error("boom"));
    const guarded = withHandlerGuard("test:handler", inner);
    await guarded();
    expect(spy).toHaveBeenCalledWith(
      JSON.stringify({ level: "error", handler: "test:handler", error: "Error: boom" }),
    );
    spy.mockRestore();
  });

  it("calls ack callback with error when last arg is function", async () => {
    const inner = vi.fn().mockRejectedValue(new Error("fail"));
    const ack = vi.fn();
    const guarded = withHandlerGuard("test:handler", inner);
    await guarded({ data: "x" }, ack);
    expect(ack).toHaveBeenCalledWith({ error: "Internal error" });
  });

  it("does not call ack when last arg is not a function", async () => {
    const inner = vi.fn().mockRejectedValue(new Error("fail"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const guarded = withHandlerGuard("test:handler", inner);
    // Last arg is a string, not a function — guard should not call it
    await expect(guarded("arg1")).resolves.toBeUndefined();
    // Only the log call, no ack
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("does not interfere with successful handler returns", async () => {
    const inner = vi.fn().mockResolvedValue({ ok: true });
    const guarded = withHandlerGuard("test:handler", inner);
    const result = await guarded({ data: "x" });
    expect(result).toEqual({ ok: true });
  });
});
