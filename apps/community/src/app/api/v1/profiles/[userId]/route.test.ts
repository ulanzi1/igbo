// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/server/auth/config", () => ({
  auth: vi.fn(),
}));

vi.mock("@igbo/db/queries/community-profiles", () => ({
  getPublicProfileForViewer: vi.fn(),
  getProfileWithSocialLinks: vi.fn(),
}));

vi.mock("@igbo/db", () => ({ db: {} }));
vi.mock("@igbo/db/schema/community-profiles", () => ({
  communityProfiles: {},
  communitySocialLinks: {},
}));
vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => Promise<Response>) => fn()),
}));
vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
}));

import { GET } from "./route";
import { auth } from "@/server/auth/config";
import {
  getPublicProfileForViewer,
  getProfileWithSocialLinks,
} from "@igbo/db/queries/community-profiles";

const mockAuth = vi.mocked(auth);
const mockGetPublicProfile = vi.mocked(getPublicProfileForViewer);
const mockGetProfileWithLinks = vi.mocked(getProfileWithSocialLinks);

const VIEWER_ID = "viewer-123";
const TARGET_ID = "target-456";

function makeRequest(userId: string) {
  return new Request(`http://localhost:3000/api/v1/profiles/${userId}`, {
    headers: { Origin: "http://localhost:3000", Host: "localhost:3000" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/profiles/[userId]", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    const res = await GET(makeRequest(TARGET_ID) as never);
    expect(res.status).toBe(401);
  });

  it("returns own profile via getProfileWithSocialLinks when viewer === target", async () => {
    mockAuth.mockResolvedValue({ user: { id: VIEWER_ID, role: "MEMBER" } } as never);
    mockGetProfileWithLinks.mockResolvedValue({
      profile: { id: "p1", displayName: "Eze", locationVisible: true } as never,
      socialLinks: [],
    });

    const res = await GET(makeRequest(VIEWER_ID) as never);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { profile: { id: string } } };
    expect(body.data.profile.id).toBe("p1");
    expect(mockGetProfileWithLinks).toHaveBeenCalledWith(VIEWER_ID);
    expect(mockGetPublicProfile).not.toHaveBeenCalled();
  });

  it("returns 404 when own profile not found", async () => {
    mockAuth.mockResolvedValue({ user: { id: VIEWER_ID, role: "MEMBER" } } as never);
    mockGetProfileWithLinks.mockResolvedValue({ profile: null, socialLinks: [] });

    const res = await GET(makeRequest(VIEWER_ID) as never);
    expect(res.status).toBe(404);
  });

  it("returns 200 for PUBLIC profile viewed by member", async () => {
    mockAuth.mockResolvedValue({ user: { id: VIEWER_ID, role: "MEMBER" } } as never);
    mockGetPublicProfile.mockResolvedValue({
      profile: {
        id: "p2",
        displayName: "Chidi",
        profileVisibility: "PUBLIC_TO_MEMBERS",
        locationVisible: true,
      } as never,
      socialLinks: [],
    });

    const res = await GET(makeRequest(TARGET_ID) as never);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { profile: { id: string } } };
    expect(body.data.profile.id).toBe("p2");
    expect(mockGetPublicProfile).toHaveBeenCalledWith(VIEWER_ID, TARGET_ID, "MEMBER");
  });

  it("returns 404 (not 403) for PRIVATE profile viewed by non-admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: VIEWER_ID, role: "MEMBER" } } as never);
    mockGetPublicProfile.mockResolvedValue({ profile: null, socialLinks: [] });

    const res = await GET(makeRequest(TARGET_ID) as never);
    expect(res.status).toBe(404);
  });

  it("returns 200 for PRIVATE profile viewed by ADMIN", async () => {
    mockAuth.mockResolvedValue({ user: { id: VIEWER_ID, role: "ADMIN" } } as never);
    mockGetPublicProfile.mockResolvedValue({
      profile: {
        id: "p3",
        displayName: "Nkem",
        profileVisibility: "PRIVATE",
        locationVisible: true,
      } as never,
      socialLinks: [],
    });

    const res = await GET(makeRequest(TARGET_ID) as never);
    expect(res.status).toBe(200);
    expect(mockGetPublicProfile).toHaveBeenCalledWith(VIEWER_ID, TARGET_ID, "ADMIN");
  });

  it("returns profile without location fields when locationVisible=false", async () => {
    mockAuth.mockResolvedValue({ user: { id: VIEWER_ID, role: "MEMBER" } } as never);
    mockGetPublicProfile.mockResolvedValue({
      profile: {
        id: "p4",
        displayName: "Ada",
        locationVisible: false,
        locationCity: null,
        locationState: null,
        locationCountry: null,
      } as never,
      socialLinks: [],
    });

    const res = await GET(makeRequest(TARGET_ID) as never);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { profile: { locationCity: unknown } } };
    expect(body.data.profile.locationCity).toBeNull();
  });
});
