// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import { toHaveNoViolations } from "jest-axe";
import {
  DensityProvider,
  useDensity,
  DENSITY_STYLES,
  ROLE_DENSITY_DEFAULTS,
} from "./density-context";

expect.extend(toHaveNoViolations);

// Helper component to expose density context values
function DensityConsumer() {
  const { density, setDensity } = useDensity();
  return (
    <div>
      <span data-testid="density">{density}</span>
      <button onClick={() => setDensity("dense")}>set-dense</button>
      <button onClick={() => setDensity("comfortable")}>set-comfortable</button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("DensityProvider", () => {
  it("renders children", () => {
    render(
      <DensityProvider defaultDensity="comfortable">
        <span>child content</span>
      </DensityProvider>,
    );
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("provides the defaultDensity when no localStorage value", () => {
    render(
      <DensityProvider defaultDensity="compact">
        <DensityConsumer />
      </DensityProvider>,
    );
    expect(screen.getByTestId("density").textContent).toBe("compact");
  });

  it("overrides with localStorage value after mount (useEffect)", async () => {
    window.localStorage.setItem("portal-density", "dense");
    render(
      <DensityProvider defaultDensity="comfortable">
        <DensityConsumer />
      </DensityProvider>,
    );
    // Initially shows defaultDensity (SSR-safe)
    // After useEffect fires, reads localStorage
    await waitFor(() => {
      expect(screen.getByTestId("density").textContent).toBe("dense");
    });
  });

  it("setDensity updates state", () => {
    render(
      <DensityProvider defaultDensity="comfortable">
        <DensityConsumer />
      </DensityProvider>,
    );
    expect(screen.getByTestId("density").textContent).toBe("comfortable");
    act(() => {
      screen.getByRole("button", { name: "set-dense" }).click();
    });
    expect(screen.getByTestId("density").textContent).toBe("dense");
  });

  it("setDensity writes to localStorage", () => {
    render(
      <DensityProvider defaultDensity="comfortable">
        <DensityConsumer />
      </DensityProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "set-dense" }).click();
    });
    expect(window.localStorage.getItem("portal-density")).toBe("dense");
  });

  it("ignores invalid localStorage values and falls back to defaultDensity", async () => {
    window.localStorage.setItem("portal-density", "invalid-value");
    render(
      <DensityProvider defaultDensity="compact">
        <DensityConsumer />
      </DensityProvider>,
    );
    // After useEffect fires, invalid value is ignored; stays at defaultDensity
    await waitFor(() => {
      expect(screen.getByTestId("density").textContent).toBe("compact");
    });
  });
});

describe("useDensity", () => {
  it("throws when used outside DensityProvider", () => {
    function BadConsumer() {
      useDensity();
      return null;
    }
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<BadConsumer />)).toThrow(
      "useDensity must be used within a DensityProvider",
    );
    consoleSpy.mockRestore();
  });
});

describe("ROLE_DENSITY_DEFAULTS", () => {
  it("JOB_SEEKER defaults to comfortable", () => {
    expect(ROLE_DENSITY_DEFAULTS["JOB_SEEKER"]).toBe("comfortable");
  });

  it("EMPLOYER defaults to compact", () => {
    expect(ROLE_DENSITY_DEFAULTS["EMPLOYER"]).toBe("compact");
  });

  it("JOB_ADMIN defaults to dense", () => {
    expect(ROLE_DENSITY_DEFAULTS["JOB_ADMIN"]).toBe("dense");
  });

  it("unknown role has no default (fallback handled by consumer)", () => {
    expect(ROLE_DENSITY_DEFAULTS["UNKNOWN"]).toBeUndefined();
  });
});

describe("DENSITY_STYLES", () => {
  it("has styles for all three density levels", () => {
    expect(DENSITY_STYLES.comfortable).toBeTruthy();
    expect(DENSITY_STYLES.compact).toBeTruthy();
    expect(DENSITY_STYLES.dense).toBeTruthy();
  });

  it("comfortable has largest padding", () => {
    expect(DENSITY_STYLES.comfortable).toContain("py-4");
    expect(DENSITY_STYLES.comfortable).toContain("text-base");
  });

  it("compact has medium padding", () => {
    expect(DENSITY_STYLES.compact).toContain("py-3");
    expect(DENSITY_STYLES.compact).toContain("text-sm");
  });

  it("dense has smallest padding", () => {
    expect(DENSITY_STYLES.dense).toContain("py-2");
    expect(DENSITY_STYLES.dense).toContain("text-sm");
  });
});
