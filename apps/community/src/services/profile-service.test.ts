// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@igbo/db/queries/community-profiles", () => ({
  updateProfileFields: vi.fn(),
  updatePrivacySettings: vi.fn(),
  getProfileWithSocialLinks: vi.fn(),
}));

vi.mock("@igbo/db/queries/community-social-links", () => ({
  upsertSocialLink: vi.fn(),
  deleteSocialLink: vi.fn(),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock("@igbo/db", () => ({ db: {} }));
vi.mock("@igbo/db/schema/community-profiles", () => ({
  communityProfiles: {},
  communitySocialLinks: {},
}));

import {
  updateProfile,
  updatePrivacySettings,
  linkSocialAccount,
  unlinkSocialAccount,
} from "./profile-service";

import {
  updateProfileFields,
  updatePrivacySettings as updatePrivacyQuery,
} from "@igbo/db/queries/community-profiles";
import { upsertSocialLink, deleteSocialLink } from "@igbo/db/queries/community-social-links";
import { eventBus } from "@/services/event-bus";

const mockUpdateProfileFields = vi.mocked(updateProfileFields);
const mockUpdatePrivacyQuery = vi.mocked(updatePrivacyQuery);
const mockUpsertSocialLink = vi.mocked(upsertSocialLink);
const mockDeleteSocialLink = vi.mocked(deleteSocialLink);
const mockEmit = vi.mocked(eventBus.emit);

const USER_ID = "user-abc";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateProfile", () => {
  it("calls updateProfileFields and emits member.profile_updated", async () => {
    mockUpdateProfileFields.mockResolvedValue({ id: "p1", displayName: "Eze" } as never);

    await updateProfile(USER_ID, { displayName: "Eze" });

    expect(mockUpdateProfileFields).toHaveBeenCalledWith(USER_ID, { displayName: "Eze" });
    expect(mockEmit).toHaveBeenCalledWith(
      "member.profile_updated",
      expect.objectContaining({ userId: USER_ID }),
    );
  });

  it("returns the updated profile", async () => {
    const profile = { id: "p1", displayName: "Chidi" };
    mockUpdateProfileFields.mockResolvedValue(profile as never);

    const result = await updateProfile(USER_ID, { displayName: "Chidi" });
    expect(result).toEqual(profile);
  });
});

describe("updatePrivacySettings", () => {
  it("calls updatePrivacySettings query and emits member.privacy_settings_updated", async () => {
    mockUpdatePrivacyQuery.mockResolvedValue({ id: "p1" } as never);

    await updatePrivacySettings(USER_ID, { profileVisibility: "PRIVATE" });

    expect(mockUpdatePrivacyQuery).toHaveBeenCalledWith(USER_ID, { profileVisibility: "PRIVATE" });
    expect(mockEmit).toHaveBeenCalledWith(
      "member.privacy_settings_updated",
      expect.objectContaining({ userId: USER_ID }),
    );
  });

  it("handles locationVisible update", async () => {
    mockUpdatePrivacyQuery.mockResolvedValue({ id: "p1" } as never);

    await updatePrivacySettings(USER_ID, { locationVisible: false });

    expect(mockUpdatePrivacyQuery).toHaveBeenCalledWith(USER_ID, { locationVisible: false });
  });
});

describe("linkSocialAccount", () => {
  it("calls upsertSocialLink and emits member.social_account_linked", async () => {
    mockUpsertSocialLink.mockResolvedValue({ id: "sl1" } as never);

    await linkSocialAccount(USER_ID, "FACEBOOK", "Eze Chukwu", "https://facebook.com/eze");

    expect(mockUpsertSocialLink).toHaveBeenCalledWith(USER_ID, "FACEBOOK", {
      providerDisplayName: "Eze Chukwu",
      providerProfileUrl: "https://facebook.com/eze",
    });
    expect(mockEmit).toHaveBeenCalledWith(
      "member.social_account_linked",
      expect.objectContaining({ userId: USER_ID, provider: "FACEBOOK" }),
    );
  });
});

describe("unlinkSocialAccount", () => {
  it("calls deleteSocialLink and emits member.social_account_unlinked", async () => {
    mockDeleteSocialLink.mockResolvedValue(undefined);

    await unlinkSocialAccount(USER_ID, "TWITTER");

    expect(mockDeleteSocialLink).toHaveBeenCalledWith(USER_ID, "TWITTER");
    expect(mockEmit).toHaveBeenCalledWith(
      "member.social_account_unlinked",
      expect.objectContaining({ userId: USER_ID, provider: "TWITTER" }),
    );
  });
});
