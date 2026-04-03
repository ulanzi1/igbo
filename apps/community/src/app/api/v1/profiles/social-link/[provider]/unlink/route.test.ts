// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: vi.fn(),
}));

vi.mock("@/services/profile-service", () => ({
  unlinkSocialAccount: vi.fn(),
}));

vi.mock("@igbo/db", () => ({ db: {} }));
vi.mock("@igbo/db/schema/community-profiles", () => ({
  communityProfiles: {},
  communitySocialLinks: {},
}));
vi.mock("@igbo/db/queries/community-profiles", () => ({}));
vi.mock("@igbo/db/queries/community-social-links", () => ({}));
vi.mock("@/services/event-bus", () => ({ eventBus: { emit: vi.fn() } }));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => Promise<Response>) => fn()),
}));
vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
}));

import { DELETE } from "./route";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import * as profileService from "@/services/profile-service";

const mockRequireAuth = vi.mocked(requireAuthenticatedSession);
const mockUnlink = vi.mocked(profileService.unlinkSocialAccount);

function makeDeleteRequest(provider: string) {
  return new Request(`http://localhost:3000/api/v1/profiles/social-link/${provider}/unlink`, {
    method: "DELETE",
    headers: { Origin: "http://localhost:3000", Host: "localhost:3000" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/v1/profiles/social-link/[provider]/unlink", () => {
  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuth.mockRejectedValue(new ApiError({ title: "Unauthorized", status: 401 }));

    const res = await DELETE(makeDeleteRequest("facebook") as never);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid provider", async () => {
    mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER" });

    const res = await DELETE(makeDeleteRequest("invalid-provider") as never);
    expect(res.status).toBe(400);
  });

  it("unlinks account and returns success for valid provider", async () => {
    mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER" });
    mockUnlink.mockResolvedValue(undefined);

    const res = await DELETE(makeDeleteRequest("facebook") as never);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { unlinked: boolean } };
    expect(body.data.unlinked).toBe(true);
    expect(mockUnlink).toHaveBeenCalledWith("user-1", "FACEBOOK");
  });
});
