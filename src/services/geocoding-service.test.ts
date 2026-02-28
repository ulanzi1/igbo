// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { mockEnv, mockFetch } = vi.hoisted(() => {
  const mockEnv = {
    ENABLE_GEOCODING: "false",
    NOMINATIM_URL: "https://nominatim.openstreetmap.org",
  };

  const mockFetch = vi.fn();

  return { mockEnv, mockFetch };
});

vi.mock("server-only", () => ({}));

vi.mock("@/env", () => ({
  get env() {
    return mockEnv;
  },
}));

// Replace global fetch with our mock
global.fetch = mockFetch;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNominatimResponse(
  overrides: Partial<{
    lat: string;
    lon: string;
    display_name: string;
    address: Record<string, string>;
  }> = {},
) {
  return [
    {
      lat: "6.4550575",
      lon: "7.5138569",
      display_name: "Obigbo, Rivers State, Nigeria",
      address: {
        city: "Obigbo",
        state: "Rivers State",
        country: "Nigeria",
        country_code: "ng",
      },
      ...overrides,
    },
  ];
}

function mockOkFetch(body: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => body,
  });
}

function mockErrorFetch(status = 429) {
  mockFetch.mockResolvedValueOnce({ ok: false, status });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("NoOpGeocodingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.ENABLE_GEOCODING = "false";
  });

  it("returns null for any input", async () => {
    const { NoOpGeocodingService } = await import("./geocoding-service");
    const svc = new NoOpGeocodingService();
    const result = await svc.geocode("Lagos, Nigeria");
    expect(result).toBeNull();
  });

  it("returns null for empty string", async () => {
    const { NoOpGeocodingService } = await import("./geocoding-service");
    const svc = new NoOpGeocodingService();
    const result = await svc.geocode("");
    expect(result).toBeNull();
  });
});

describe("NominatimGeocodingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.ENABLE_GEOCODING = "true";
    mockEnv.NOMINATIM_URL = "https://nominatim.openstreetmap.org";
  });

  it("returns parsed lat/lng and address components on success", async () => {
    mockOkFetch(makeNominatimResponse());
    const { NominatimGeocodingService } = await import("./geocoding-service");
    const svc = new NominatimGeocodingService();
    const result = await svc.geocode("Obigbo, Nigeria");

    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(6.455);
    expect(result!.lng).toBeCloseTo(7.514);
    expect(result!.displayName).toBe("Obigbo, Rivers State, Nigeria");
    expect(result!.city).toBe("Obigbo");
    expect(result!.state).toBe("Rivers State");
    expect(result!.country).toBe("Nigeria");
    expect(result!.countryCode).toBe("ng");
  });

  it("sets the correct User-Agent header", async () => {
    mockOkFetch(makeNominatimResponse());
    const { NominatimGeocodingService } = await import("./geocoding-service");
    const svc = new NominatimGeocodingService();
    await svc.geocode("Enugu, Nigeria");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["User-Agent"]).toBe(
      "OBIGBO Community Platform",
    );
  });

  it("constructs the correct URL query params", async () => {
    mockOkFetch(makeNominatimResponse());
    const { NominatimGeocodingService } = await import("./geocoding-service");
    const svc = new NominatimGeocodingService();
    await svc.geocode("Port Harcourt");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/search");
    expect(parsed.searchParams.get("q")).toBe("Port Harcourt");
    expect(parsed.searchParams.get("format")).toBe("json");
    expect(parsed.searchParams.get("limit")).toBe("1");
    expect(parsed.searchParams.get("addressdetails")).toBe("1");
  });

  it("returns null on empty results array", async () => {
    mockOkFetch([]);
    const { NominatimGeocodingService } = await import("./geocoding-service");
    const svc = new NominatimGeocodingService();
    const result = await svc.geocode("xyzzy-nonexistent-place-12345");
    expect(result).toBeNull();
  });

  it("returns null on HTTP error (e.g. 429)", async () => {
    mockErrorFetch(429);
    const { NominatimGeocodingService } = await import("./geocoding-service");
    const svc = new NominatimGeocodingService();
    const result = await svc.geocode("Lagos");
    expect(result).toBeNull();
  });

  it("returns null on network error — does not throw", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network failure"));
    const { NominatimGeocodingService } = await import("./geocoding-service");
    const svc = new NominatimGeocodingService();
    await expect(svc.geocode("Lagos")).resolves.toBeNull();
  });

  it("returns null and skips fetch for empty query", async () => {
    const { NominatimGeocodingService } = await import("./geocoding-service");
    const svc = new NominatimGeocodingService();
    const result = await svc.geocode("   ");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("createGeocodingService factory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns NoOpGeocodingService when ENABLE_GEOCODING is false", async () => {
    mockEnv.ENABLE_GEOCODING = "false";
    const { createGeocodingService, NoOpGeocodingService } = await import("./geocoding-service");
    const svc = createGeocodingService();
    expect(svc).toBeInstanceOf(NoOpGeocodingService);
  });

  it("returns NominatimGeocodingService when ENABLE_GEOCODING is true", async () => {
    mockEnv.ENABLE_GEOCODING = "true";
    const { createGeocodingService, NominatimGeocodingService } =
      await import("./geocoding-service");
    const svc = createGeocodingService();
    expect(svc).toBeInstanceOf(NominatimGeocodingService);
  });
});
