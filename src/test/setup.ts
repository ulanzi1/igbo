import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import * as axeMatchers from "vitest-axe/matchers";
import { expect } from "vitest";
expect.extend(axeMatchers);

vi.mock("prom-client", () => {
  return {
    Registry: class MockRegistry {
      getSingleMetric = vi.fn(() => undefined);
      metrics = vi.fn(() => Promise.resolve(""));
      contentType = "text/plain; version=0.0.4";
    },
    collectDefaultMetrics: vi.fn(),
    Histogram: class MockHistogram {
      observe = vi.fn();
      startTimer = vi.fn(() => vi.fn());
    },
    Counter: class MockCounter {
      inc = vi.fn();
    },
    Gauge: class MockGauge {
      set = vi.fn();
      inc = vi.fn();
      dec = vi.fn();
    },
  };
});

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  setUser: vi.fn(),
  init: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({})),
  withSentryConfig: vi.fn((config: unknown) => config),
}));
