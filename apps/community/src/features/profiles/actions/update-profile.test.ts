// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/server/auth/config", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/sanitize", () => ({
  sanitizeHtml: (s: string) => s,
}));

vi.mock("@/services/profile-service", () => ({
  updateProfile: vi.fn(),
}));

vi.mock("@igbo/db", () => ({ db: {} }));
vi.mock("@igbo/db/schema/community-profiles", () => ({
  communityProfiles: {},
  communitySocialLinks: {},
}));
vi.mock("@igbo/db/queries/community-profiles", () => ({}));
vi.mock("@igbo/db/queries/community-social-links", () => ({}));
vi.mock("@/services/event-bus", () => ({ eventBus: { emit: vi.fn() } }));

import { updateProfileAction } from "./update-profile";
import { auth } from "@/server/auth/config";
import * as profileService from "@/services/profile-service";

const mockAuth = vi.mocked(auth);
const mockUpdateProfile = vi.mocked(profileService.updateProfile);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateProfileAction", () => {
  it("returns unauthorized when no session", async () => {
    mockAuth.mockResolvedValue(null as never);

    const result = await updateProfileAction({ displayName: "Eze" });

    expect(result).toEqual({ success: false, error: "Unauthorized" });
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("returns validation error for empty displayName", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } } as never);

    const result = await updateProfileAction({ displayName: "" });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("calls profileService.updateProfile on valid input and returns success", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } } as never);
    mockUpdateProfile.mockResolvedValue({ id: "p1" } as never);

    const result = await updateProfileAction({
      displayName: "Chukwuemeka",
      bio: "Hello world",
      interests: ["culture"],
    });

    expect(result).toEqual({ success: true });
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ displayName: "Chukwuemeka", bio: "Hello world" }),
    );
  });

  it("returns error when profileService throws", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } } as never);
    mockUpdateProfile.mockRejectedValue(new Error("DB error"));

    const result = await updateProfileAction({ displayName: "Eze" });

    expect(result).toEqual({ success: false, error: "Failed to update profile" });
  });
});
