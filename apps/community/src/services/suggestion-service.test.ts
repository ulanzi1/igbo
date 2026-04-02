// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockDbExecute = vi.fn();
vi.mock("@igbo/db", () => ({
  db: { execute: (...args: unknown[]) => mockDbExecute(...args) },
}));

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();
const mockRedisSadd = vi.fn();
const mockRedisExpire = vi.fn();
const mockRedisSmembers = vi.fn();

const mockRedisClient = {
  get: (...args: unknown[]) => mockRedisGet(...args),
  set: (...args: unknown[]) => mockRedisSet(...args),
  del: (...args: unknown[]) => mockRedisDel(...args),
  sadd: (...args: unknown[]) => mockRedisSadd(...args),
  expire: (...args: unknown[]) => mockRedisExpire(...args),
  smembers: (...args: unknown[]) => mockRedisSmembers(...args),
};

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => mockRedisClient,
}));

import {
  getMemberSuggestions,
  dismissSuggestion,
  SUGGESTION_CACHE_TTL_SECONDS,
  SUGGESTION_DISMISS_TTL_SECONDS,
} from "./suggestion-service";

const VIEWER_ID = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";
const USER_C = "00000000-0000-4000-8000-000000000003";
const USER_D = "00000000-0000-4000-8000-000000000004";

function makeViewerProfile(overrides: Record<string, unknown> = {}) {
  return {
    location_city: "Houston",
    location_state: "Texas",
    location_country: "United States",
    interests: ["Cultural Heritage", "Music"],
    ...overrides,
  };
}

function makeCandidateRow(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    user_id: userId,
    display_name: `User ${userId.slice(-4)}`,
    photo_url: null,
    location_city: "Lagos",
    location_state: "Lagos State",
    location_country: "Nigeria",
    location_visible: true,
    interests: [],
    languages: ["Igbo", "English"],
    bio: null,
    membership_tier: "BASIC",
    ...overrides,
  };
}

beforeEach(() => {
  // mockReset clears queued mockResolvedValueOnce returns AND call history
  mockDbExecute.mockReset();
  mockRedisGet.mockReset();
  mockRedisSet.mockReset();
  mockRedisDel.mockReset();
  mockRedisSadd.mockReset();
  mockRedisExpire.mockReset();
  mockRedisSmembers.mockReset();

  // Default Redis responses
  mockRedisGet.mockResolvedValue(null); // no cache by default
  mockRedisSet.mockResolvedValue("OK");
  mockRedisDel.mockResolvedValue(1);
  mockRedisSadd.mockResolvedValue(1);
  mockRedisExpire.mockResolvedValue(1);
  mockRedisSmembers.mockResolvedValue([]); // no dismissed by default
});

// Helper to set up the standard 4-DB-call sequence for getMemberSuggestions.
// db.execute() returns an iterable result (like a postgres RowList / array) directly —
// the source code uses Array.from(rows) and rows.map() on the resolved value, NOT rows.rows.
function setupDbForSuggestions(
  viewerProfile: Record<string, unknown> | null,
  messagedRows: unknown[],
  blockedRows: unknown[],
  candidateRows: unknown[],
) {
  if (viewerProfile === null) {
    mockDbExecute.mockResolvedValueOnce([]); // profile not found → early return
    return;
  }
  mockDbExecute
    .mockResolvedValueOnce([viewerProfile]) // viewer profile (Array.from used)
    .mockResolvedValueOnce(messagedRows) // messaged users (.map used)
    .mockResolvedValueOnce(blockedRows) // blocked users (.map used)
    .mockResolvedValueOnce(candidateRows); // candidates (Array.from used)
}

describe("getMemberSuggestions", () => {
  it("returns empty array when viewer has no profile", async () => {
    setupDbForSuggestions(null, [], [], []);

    const result = await getMemberSuggestions(VIEWER_ID);
    expect(result).toEqual([]);
  });

  it("returns cached result from Redis when cache present", async () => {
    const cached = [
      {
        member: {
          userId: USER_B,
          displayName: "Alice",
          photoUrl: null,
          locationCity: "Houston",
          locationState: "Texas",
          locationCountry: "United States",
          interests: [],
          languages: [],
          membershipTier: "BASIC",
          bio: null,
        },
        reasonType: "city",
        reasonValue: "Houston",
      },
    ];
    mockRedisGet.mockResolvedValueOnce(JSON.stringify(cached));

    const result = await getMemberSuggestions(VIEWER_ID);
    expect(result).toEqual(cached);
    // DB should not be called
    expect(mockDbExecute).not.toHaveBeenCalled();
  });

  it("excludes blocked members (bidirectional)", async () => {
    setupDbForSuggestions(
      makeViewerProfile(),
      [], // no messaged users
      [{ id: USER_B }], // USER_B is blocked
      [makeCandidateRow(USER_C)], // only USER_C in candidates (USER_B excluded by SQL)
    );

    const result = await getMemberSuggestions(VIEWER_ID);
    expect(result).toHaveLength(1);
    expect(result[0].member.userId).toBe(USER_C);
  });

  it("excludes already-messaged members", async () => {
    setupDbForSuggestions(
      makeViewerProfile(),
      [{ user_id: USER_B }], // USER_B was messaged
      [], // no blocked
      [makeCandidateRow(USER_C)], // only USER_C in candidates
    );

    const result = await getMemberSuggestions(VIEWER_ID);
    expect(result).toHaveLength(1);
    expect(result[0].member.userId).toBe(USER_C);
  });

  it("excludes dismissed members", async () => {
    mockRedisSmembers.mockResolvedValueOnce([USER_B]); // USER_B is dismissed

    setupDbForSuggestions(
      makeViewerProfile(),
      [],
      [],
      [makeCandidateRow(USER_C)], // only USER_C in candidates (USER_B excluded via dismissedIds)
    );

    const result = await getMemberSuggestions(VIEWER_ID);
    expect(result).toHaveLength(1);
    expect(result[0].member.userId).toBe(USER_C);
  });

  it("scores by city match first (reasonType: city)", async () => {
    setupDbForSuggestions(
      makeViewerProfile(),
      [],
      [],
      [
        makeCandidateRow(USER_B, {
          location_city: "Houston",
          location_state: "Texas",
          location_country: "United States",
        }),
        makeCandidateRow(USER_C, {
          location_city: "Dallas",
          location_state: "Texas",
          location_country: "United States",
        }),
      ],
    );

    const result = await getMemberSuggestions(VIEWER_ID, 2);
    // Houston city match scores higher than state-only match
    expect(result[0].member.userId).toBe(USER_B);
    expect(result[0].reasonType).toBe("city");
    expect(result[0].reasonValue).toBe("Houston");
    // USER_C gets state match
    expect(result[1].reasonType).toBe("state");
  });

  it("scores by state match when no city match (reasonType: state)", async () => {
    setupDbForSuggestions(
      makeViewerProfile(),
      [],
      [],
      [
        makeCandidateRow(USER_B, {
          location_city: "Austin",
          location_state: "Texas",
          location_country: "United States",
        }),
      ],
    );

    const result = await getMemberSuggestions(VIEWER_ID, 1);
    expect(result[0].reasonType).toBe("state");
    expect(result[0].reasonValue).toBe("Texas");
  });

  it("scores by interest when no geo match (reasonType: interest)", async () => {
    setupDbForSuggestions(
      makeViewerProfile(),
      [],
      [],
      [
        makeCandidateRow(USER_B, {
          location_city: "London",
          location_state: "England",
          location_country: "United Kingdom",
          interests: ["Cultural Heritage", "Art"],
        }),
      ],
    );

    const result = await getMemberSuggestions(VIEWER_ID, 1);
    expect(result[0].reasonType).toBe("interest");
    expect(result[0].reasonValue).toBe("Cultural Heritage");
  });

  it("assigns community reason when no geo or interest match", async () => {
    setupDbForSuggestions(
      makeViewerProfile(),
      [],
      [],
      [
        makeCandidateRow(USER_B, {
          location_city: "Tokyo",
          location_state: "Kanto",
          location_country: "Japan",
          interests: ["Anime"],
        }),
      ],
    );

    const result = await getMemberSuggestions(VIEWER_ID, 1);
    expect(result[0].reasonType).toBe("community");
    expect(result[0].reasonValue).toBe("");
  });

  it("returns at most limit results", async () => {
    setupDbForSuggestions(
      makeViewerProfile(),
      [],
      [],
      [makeCandidateRow(USER_B), makeCandidateRow(USER_C), makeCandidateRow(USER_D)],
    );

    const result = await getMemberSuggestions(VIEWER_ID, 2);
    expect(result).toHaveLength(2);
  });

  it("masks location when location_visible is false", async () => {
    setupDbForSuggestions(
      makeViewerProfile(),
      [],
      [],
      [
        makeCandidateRow(USER_B, {
          location_city: "Houston",
          location_state: "Texas",
          location_country: "United States",
          location_visible: false,
        }),
      ],
    );

    const result = await getMemberSuggestions(VIEWER_ID, 1);
    // Masked in MemberCardData
    expect(result[0].member.locationCity).toBeNull();
    expect(result[0].member.locationState).toBeNull();
    expect(result[0].member.locationCountry).toBeNull();
    // But scoring still uses raw location — city match gives reasonType: city
    expect(result[0].reasonType).toBe("city");
  });

  it("caches result in Redis with correct TTL", async () => {
    setupDbForSuggestions(makeViewerProfile(), [], [], [makeCandidateRow(USER_B)]);

    await getMemberSuggestions(VIEWER_ID);

    expect(mockRedisSet).toHaveBeenCalledWith(
      `suggestions:${VIEWER_ID}`,
      expect.any(String),
      "EX",
      SUGGESTION_CACHE_TTL_SECONDS,
    );
  });
});

describe("dismissSuggestion", () => {
  it("adds dismissed userId to Redis set and invalidates cache", async () => {
    await dismissSuggestion(VIEWER_ID, USER_B);

    expect(mockRedisSadd).toHaveBeenCalledWith(`suggestions:dismissed:${VIEWER_ID}`, USER_B);
    expect(mockRedisExpire).toHaveBeenCalledWith(
      `suggestions:dismissed:${VIEWER_ID}`,
      SUGGESTION_DISMISS_TTL_SECONDS,
    );
    expect(mockRedisDel).toHaveBeenCalledWith(`suggestions:${VIEWER_ID}`);
  });
});
