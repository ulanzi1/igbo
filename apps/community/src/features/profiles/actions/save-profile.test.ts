// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@igbo/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/services/onboarding-service", () => ({
  saveProfile: vi.fn(),
}));

import { saveProfileAction } from "./save-profile";
import { auth } from "@igbo/auth";
import { saveProfile } from "@/services/onboarding-service";

const mockAuth = vi.mocked(auth);
const mockSaveProfile = vi.mocked(saveProfile);

const SESSION = {
  user: { id: "user-1", role: "MEMBER", accountStatus: "APPROVED", profileCompleted: false },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveProfileAction", () => {
  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const result = await saveProfileAction({ displayName: "Test" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });

  it("returns error when displayName is empty", async () => {
    mockAuth.mockResolvedValue(SESSION as never);
    const result = await saveProfileAction({ displayName: "" });
    expect(result.success).toBe(false);
  });

  it("returns error when displayName exceeds 255 chars", async () => {
    mockAuth.mockResolvedValue(SESSION as never);
    const result = await saveProfileAction({ displayName: "a".repeat(256) });
    expect(result.success).toBe(false);
  });

  it("calls saveProfile with userId and valid payload", async () => {
    mockAuth.mockResolvedValue(SESSION as never);
    mockSaveProfile.mockResolvedValue(undefined);

    const result = await saveProfileAction({
      displayName: "Chukwuemeka",
      interests: ["music", "culture"],
    });

    expect(result.success).toBe(true);
    expect(mockSaveProfile).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ displayName: "Chukwuemeka" }),
    );
  });

  it("returns error when saveProfile throws", async () => {
    mockAuth.mockResolvedValue(SESSION as never);
    mockSaveProfile.mockRejectedValue(new Error("DB error"));

    const result = await saveProfileAction({ displayName: "Test" });
    expect(result.success).toBe(false);
  });
});
