// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  parseSearchUrlParams,
  serializeSearchUrlParams,
  countActiveFilters,
  DEFAULT_SEARCH_STATE,
  type JobSearchUrlState,
} from "./search-url-params";

// ---------------------------------------------------------------------------
// parseSearchUrlParams
// ---------------------------------------------------------------------------

describe("parseSearchUrlParams — basic fields", () => {
  it("returns default state for empty URLSearchParams", () => {
    const state = parseSearchUrlParams(new URLSearchParams());
    expect(state).toEqual(DEFAULT_SEARCH_STATE);
  });

  it("parses q from URLSearchParams", () => {
    const state = parseSearchUrlParams(new URLSearchParams("q=engineer"));
    expect(state.q).toBe("engineer");
  });

  it("parses sort=date", () => {
    const state = parseSearchUrlParams(new URLSearchParams("sort=date"));
    expect(state.sort).toBe("date");
  });

  it("defaults sort to 'relevance' for unknown value", () => {
    const state = parseSearchUrlParams(new URLSearchParams("sort=unknown"));
    expect(state.sort).toBe("relevance");
  });

  it("parses cursor", () => {
    const state = parseSearchUrlParams(new URLSearchParams("cursor=abc123"));
    expect(state.cursor).toBe("abc123");
  });

  it("parses multi-value location", () => {
    const params = new URLSearchParams();
    params.append("location", "Lagos");
    params.append("location", "Toronto");
    const state = parseSearchUrlParams(params);
    expect(state.location).toEqual(["Lagos", "Toronto"]);
  });

  it("parses multi-value employmentType", () => {
    const params = new URLSearchParams();
    params.append("employmentType", "full_time");
    params.append("employmentType", "contract");
    const state = parseSearchUrlParams(params);
    expect(state.employmentType).toEqual(["full_time", "contract"]);
  });

  it("drops invalid employmentType values", () => {
    const params = new URLSearchParams("employmentType=bogus_type");
    const state = parseSearchUrlParams(params);
    expect(state.employmentType).toEqual([]);
  });

  it("parses salaryMin and salaryMax as integers", () => {
    const state = parseSearchUrlParams(new URLSearchParams("salaryMin=50000&salaryMax=150000"));
    expect(state.salaryMin).toBe(50000);
    expect(state.salaryMax).toBe(150000);
  });

  it("drops non-integer salaryMin", () => {
    const state = parseSearchUrlParams(new URLSearchParams("salaryMin=abc"));
    expect(state.salaryMin).toBeNull();
  });

  it("parses remote=true → true", () => {
    const state = parseSearchUrlParams(new URLSearchParams("remote=true"));
    expect(state.remote).toBe(true);
  });

  it("remote=false → false (absent in URL = off per M1)", () => {
    const state = parseSearchUrlParams(new URLSearchParams("remote=false"));
    expect(state.remote).toBe(false);
  });

  it("parses cultural context flags", () => {
    const state = parseSearchUrlParams(
      new URLSearchParams("culturalContextDiasporaFriendly=true&culturalContextIgboPreferred=true"),
    );
    expect(state.culturalContextDiasporaFriendly).toBe(true);
    expect(state.culturalContextIgboPreferred).toBe(true);
    expect(state.culturalContextCommunityReferred).toBe(false);
  });

  it("parses from a plain Record object (initial SSR params)", () => {
    const record: Record<string, string | string[]> = {
      q: "engineer",
      sort: "date",
      location: ["Lagos", "Remote"],
    };
    const state = parseSearchUrlParams(record);
    expect(state.q).toBe("engineer");
    expect(state.sort).toBe("date");
    expect(state.location).toEqual(["Lagos", "Remote"]);
  });
});

// ---------------------------------------------------------------------------
// serializeSearchUrlParams
// ---------------------------------------------------------------------------

describe("serializeSearchUrlParams — default values omitted", () => {
  it("produces empty params for default state", () => {
    const params = serializeSearchUrlParams(DEFAULT_SEARCH_STATE);
    expect(params.toString()).toBe("");
  });

  it("emits q when non-empty", () => {
    const state: JobSearchUrlState = { ...DEFAULT_SEARCH_STATE, q: "engineer" };
    const params = serializeSearchUrlParams(state);
    expect(params.get("q")).toBe("engineer");
  });

  it("omits sort=relevance (default)", () => {
    const state: JobSearchUrlState = { ...DEFAULT_SEARCH_STATE, sort: "relevance" };
    const params = serializeSearchUrlParams(state);
    expect(params.has("sort")).toBe(false);
  });

  it("emits sort=date when not default", () => {
    const state: JobSearchUrlState = { ...DEFAULT_SEARCH_STATE, sort: "date" };
    const params = serializeSearchUrlParams(state);
    expect(params.get("sort")).toBe("date");
  });

  it("emits repeated location params", () => {
    const state: JobSearchUrlState = {
      ...DEFAULT_SEARCH_STATE,
      location: ["Lagos", "Remote"],
    };
    const params = serializeSearchUrlParams(state);
    expect(params.getAll("location")).toEqual(["Lagos", "Remote"]);
  });

  it("does NOT emit remote=false (M1 compliance)", () => {
    const state: JobSearchUrlState = { ...DEFAULT_SEARCH_STATE, remote: false };
    const params = serializeSearchUrlParams(state);
    expect(params.has("remote")).toBe(false);
  });

  it("emits remote=true when true", () => {
    const state: JobSearchUrlState = { ...DEFAULT_SEARCH_STATE, remote: true };
    const params = serializeSearchUrlParams(state);
    expect(params.get("remote")).toBe("true");
  });

  it("round-trips a complex state", () => {
    const state: JobSearchUrlState = {
      q: "engineer",
      sort: "date",
      cursor: "abc",
      location: ["Lagos", "Remote"],
      employmentType: ["full_time", "contract"],
      industry: ["Technology"],
      salaryMin: 50000,
      salaryMax: 200000,
      remote: true,
      culturalContextDiasporaFriendly: true,
      culturalContextIgboPreferred: false,
      culturalContextCommunityReferred: true,
    };
    const params = serializeSearchUrlParams(state);
    const roundTripped = parseSearchUrlParams(params);
    expect(roundTripped).toEqual(state);
  });
});

// ---------------------------------------------------------------------------
// countActiveFilters
// ---------------------------------------------------------------------------

describe("countActiveFilters", () => {
  it("returns 0 for default state", () => {
    expect(countActiveFilters(DEFAULT_SEARCH_STATE)).toBe(0);
  });

  it("counts location values", () => {
    const state = { ...DEFAULT_SEARCH_STATE, location: ["Lagos", "Toronto"] };
    expect(countActiveFilters(state)).toBe(2);
  });

  it("counts remote as 1 when true", () => {
    const state = { ...DEFAULT_SEARCH_STATE, remote: true };
    expect(countActiveFilters(state)).toBe(1);
  });

  it("does NOT count q or sort", () => {
    const state = { ...DEFAULT_SEARCH_STATE, q: "engineer", sort: "date" as const };
    expect(countActiveFilters(state)).toBe(0);
  });

  it("counts all active filters", () => {
    const state: JobSearchUrlState = {
      ...DEFAULT_SEARCH_STATE,
      location: ["Lagos"],
      employmentType: ["full_time"],
      industry: ["Technology"],
      salaryMin: 50000,
      remote: true,
      culturalContextDiasporaFriendly: true,
    };
    expect(countActiveFilters(state)).toBe(6);
  });
});
