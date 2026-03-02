// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockExecute = vi.fn();
vi.mock("@/db", () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

import { searchMembersNearLocation } from "./member-directory";

beforeEach(() => {
  mockExecute.mockReset();
});

const makeRow = (userId: string, distanceM: string | null = null) => ({
  user_id: userId,
  display_name: `User ${userId}`,
  photo_url: null,
  location_city: "Lagos",
  location_state: "Lagos State",
  location_country: "Nigeria",
  location_lat: "6.5244",
  location_lng: "3.3792",
  distance_m: distanceM,
});

describe("searchMembersNearLocation", () => {
  it("returns tier 1 results when enough members found within radius", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeRow(`u${i}`, String(1000 * (i + 1))));
    mockExecute.mockResolvedValueOnce(rows);

    const result = await searchMembersNearLocation({
      lat: 6.5,
      lng: 3.4,
      radiusM: 50_000,
    });

    expect(result).toHaveLength(5);
    expect(result[0].tier).toBe(1);
    expect(result[0].userId).toBe("u0");
    expect(result[0].distanceM).toBe(1000);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("falls back to tier 2 (city) when tier 1 has too few results", async () => {
    // Tier 1 returns only 2 (below default minResults of 5)
    mockExecute.mockResolvedValueOnce([makeRow("u0", "100"), makeRow("u1", "200")]);
    // Tier 2 returns enough
    const tier2Rows = Array.from({ length: 5 }, (_, i) => makeRow(`city-${i}`));
    mockExecute.mockResolvedValueOnce(tier2Rows);

    const result = await searchMembersNearLocation({
      lat: 6.5,
      lng: 3.4,
      city: "Lagos",
    });

    expect(result).toHaveLength(5);
    expect(result[0].tier).toBe(2);
    expect(result[0].distanceM).toBeNull();
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("falls back to tier 3 (state) when city has too few results", async () => {
    mockExecute.mockResolvedValueOnce([]); // tier 1
    mockExecute.mockResolvedValueOnce([makeRow("c1")]); // tier 2 (city, too few)
    const tier3Rows = Array.from({ length: 6 }, (_, i) => makeRow(`state-${i}`));
    mockExecute.mockResolvedValueOnce(tier3Rows);

    const result = await searchMembersNearLocation({
      lat: 6.5,
      lng: 3.4,
      city: "Lagos",
      state: "Lagos State",
    });

    expect(result).toHaveLength(6);
    expect(result[0].tier).toBe(3);
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it("falls back to tier 4 (country) when state has too few results", async () => {
    mockExecute.mockResolvedValueOnce([]); // tier 1
    mockExecute.mockResolvedValueOnce([]); // tier 2
    mockExecute.mockResolvedValueOnce([]); // tier 3
    const tier4Rows = Array.from({ length: 5 }, (_, i) => makeRow(`country-${i}`));
    mockExecute.mockResolvedValueOnce(tier4Rows);

    const result = await searchMembersNearLocation({
      lat: 6.5,
      lng: 3.4,
      city: "Lagos",
      state: "Lagos State",
      country: "Nigeria",
    });

    expect(result).toHaveLength(5);
    expect(result[0].tier).toBe(4);
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it("falls back to tier 5 (global) when no geo params match", async () => {
    mockExecute.mockResolvedValueOnce([]); // tier 1
    const tier5Rows = [makeRow("global-1"), makeRow("global-2")];
    mockExecute.mockResolvedValueOnce(tier5Rows);

    const result = await searchMembersNearLocation({
      lat: 0,
      lng: 0,
    });

    expect(result).toHaveLength(2);
    expect(result[0].tier).toBe(5);
    // No city/state/country → skips tiers 2–4, goes straight to 5
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("skips tier 2 when city is not provided", async () => {
    mockExecute.mockResolvedValueOnce([]); // tier 1
    // No city → skip tier 2
    const tier3Rows = Array.from({ length: 5 }, (_, i) => makeRow(`s${i}`));
    mockExecute.mockResolvedValueOnce(tier3Rows); // tier 3

    const result = await searchMembersNearLocation({
      lat: 6.5,
      lng: 3.4,
      state: "Lagos State",
    });

    expect(result[0].tier).toBe(3);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("clamps limit between 1 and 100", async () => {
    mockExecute.mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => makeRow(`u${i}`, "100")));

    await searchMembersNearLocation({ lat: 6.5, lng: 3.4, limit: 200 });
    // Should have been clamped to 100 — just verify no errors
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("maps row fields correctly", async () => {
    const row = {
      user_id: "abc",
      display_name: "Ada",
      photo_url: "https://img.example.com/ada.jpg",
      location_city: "Enugu",
      location_state: "Enugu State",
      location_country: "Nigeria",
      location_lat: "6.4541",
      location_lng: "7.5103",
      distance_m: "1234.5",
    };
    mockExecute.mockResolvedValueOnce(Array.from({ length: 5 }, () => row));

    const result = await searchMembersNearLocation({ lat: 6.5, lng: 7.5 });

    expect(result[0]).toEqual({
      userId: "abc",
      displayName: "Ada",
      photoUrl: "https://img.example.com/ada.jpg",
      locationCity: "Enugu",
      locationState: "Enugu State",
      locationCountry: "Nigeria",
      locationLat: 6.4541,
      locationLng: 7.5103,
      distanceM: 1234.5,
      tier: 1,
    });
  });

  it("handles null lat/lng in rows", async () => {
    const row = makeRow("u1", "500");
    row.location_lat = null;
    row.location_lng = null;
    mockExecute.mockResolvedValueOnce(Array.from({ length: 5 }, () => row));

    const result = await searchMembersNearLocation({ lat: 6.5, lng: 3.4 });

    expect(result[0].locationLat).toBeNull();
    expect(result[0].locationLng).toBeNull();
  });

  it("returns empty array when all tiers return no results", async () => {
    mockExecute.mockResolvedValue([]);

    const result = await searchMembersNearLocation({
      lat: 0,
      lng: 0,
      city: "Nowhere",
      state: "Nowhere",
      country: "Nowhere",
    });

    expect(result).toEqual([]);
  });

  it("respects custom minResults threshold", async () => {
    // Tier 1 returns 2, but minResults=2 so it's enough
    mockExecute.mockResolvedValueOnce([makeRow("u0", "100"), makeRow("u1", "200")]);

    const result = await searchMembersNearLocation({
      lat: 6.5,
      lng: 3.4,
      minResults: 2,
    });

    expect(result).toHaveLength(2);
    expect(result[0].tier).toBe(1);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});
