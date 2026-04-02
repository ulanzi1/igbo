// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/server/auth/config", () => ({
  auth: vi.fn(),
}));

vi.mock("@/services/profile-service", () => ({
  updatePrivacySettings: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema/community-profiles", () => ({
  communityProfiles: {},
  communitySocialLinks: {},
}));
vi.mock("@/db/queries/community-profiles", () => ({}));
vi.mock("@/db/queries/community-social-links", () => ({}));
vi.mock("@/services/event-bus", () => ({ eventBus: { emit: vi.fn() } }));

import { updatePrivacySettingsAction } from "./update-privacy-settings";
import { auth } from "@/server/auth/config";
import * as profileService from "@/services/profile-service";

const mockAuth = vi.mocked(auth);
const mockUpdatePrivacy = vi.mocked(profileService.updatePrivacySettings);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updatePrivacySettingsAction", () => {
  it("returns unauthorized when no session", async () => {
    mockAuth.mockResolvedValue(null as never);

    const result = await updatePrivacySettingsAction({ locationVisible: false });

    expect(result).toEqual({ success: false, error: "Unauthorized" });
    expect(mockUpdatePrivacy).not.toHaveBeenCalled();
  });

  it("returns validation error for invalid visibility value", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } } as never);

    const result = await updatePrivacySettingsAction({
      profileVisibility: "INVALID" as never,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("calls profileService.updatePrivacySettings and returns success", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } } as never);
    mockUpdatePrivacy.mockResolvedValue({ id: "p1" } as never);

    const result = await updatePrivacySettingsAction({
      profileVisibility: "PRIVATE",
      locationVisible: false,
    });

    expect(result).toEqual({ success: true });
    expect(mockUpdatePrivacy).toHaveBeenCalledWith("user-1", {
      profileVisibility: "PRIVATE",
      locationVisible: false,
    });
  });

  it("returns error when service throws", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } } as never);
    mockUpdatePrivacy.mockRejectedValue(new Error("DB error"));

    const result = await updatePrivacySettingsAction({ locationVisible: true });

    expect(result).toEqual({ success: false, error: "Failed to update privacy settings" });
  });
});
