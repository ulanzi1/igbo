// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

const mockGetUserMembershipTier = vi.fn();
const mockEventBusEmit = vi.fn();
const mockFindUserById = vi.fn();
const mockAuth = vi.fn();

vi.mock("@/db/queries/auth-permissions", () => ({
  getUserMembershipTier: (...args: unknown[]) => mockGetUserMembershipTier(...args),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: (...args: unknown[]) => mockEventBusEmit(...args) },
}));

vi.mock("@/db/queries/auth-queries", () => ({
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
}));

vi.mock("@/server/auth/config", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

// Required: canPublishArticle now dynamically imports articles queries for weekly count check
vi.mock("@/db/queries/articles", () => ({
  countWeeklyArticleSubmissions: vi.fn().mockResolvedValue(0),
}));

import {
  getPermissions,
  canCreateGroup,
  canPublishArticle,
  canAssignGroupLeaders,
  canCreateFeedPost,
  getMaxFeedPostsPerWeek,
  checkPermission,
  getTierUpgradeMessage,
} from "./permissions";

beforeEach(() => {
  mockGetUserMembershipTier.mockReset();
  mockEventBusEmit.mockReset();
  mockFindUserById.mockReset();
  mockAuth.mockReset();
  // Re-establish default: EventBus emit resolves (non-critical path)
  mockEventBusEmit.mockResolvedValue(undefined);
});

describe("getPermissions", () => {
  it("returns BASIC permissions for BASIC tier", async () => {
    mockGetUserMembershipTier.mockResolvedValue("BASIC");
    const perms = await getPermissions("user-1");
    expect(perms.canChat).toBe(true);
    expect(perms.canPublishArticle).toBe(false);
    expect(perms.canCreateGroup).toBe(false);
    expect(perms.canAssignGroupLeaders).toBe(false);
    expect(perms.maxArticlesPerWeek).toBe(0);
  });

  it("returns PROFESSIONAL permissions for PROFESSIONAL tier", async () => {
    mockGetUserMembershipTier.mockResolvedValue("PROFESSIONAL");
    const perms = await getPermissions("user-1");
    expect(perms.canPublishArticle).toBe(true);
    expect(perms.canCreateGroup).toBe(false);
    expect(perms.maxArticlesPerWeek).toBe(1);
    expect(perms.articleVisibility).toContain("MEMBERS_ONLY");
  });

  it("returns TOP_TIER permissions for TOP_TIER tier", async () => {
    mockGetUserMembershipTier.mockResolvedValue("TOP_TIER");
    const perms = await getPermissions("user-1");
    expect(perms.canPublishArticle).toBe(true);
    expect(perms.canCreateGroup).toBe(true);
    expect(perms.canAssignGroupLeaders).toBe(true);
    expect(perms.maxArticlesPerWeek).toBe(2);
    expect(perms.articleVisibility).toContain("PUBLIC");
  });
});

describe("canCreateGroup", () => {
  it("allows TOP_TIER users", async () => {
    mockGetUserMembershipTier.mockResolvedValue("TOP_TIER");
    const result = await canCreateGroup("user-1");
    expect(result.allowed).toBe(true);
  });

  it("denies BASIC users with upgrade message", async () => {
    mockGetUserMembershipTier.mockResolvedValue("BASIC");
    const result = await canCreateGroup("user-1");
    expect(result.allowed).toBe(false);
    expect(result.tierRequired).toBe("TOP_TIER");
    expect(result.reason).toBeDefined();
  });

  it("denies PROFESSIONAL users with upgrade message", async () => {
    mockGetUserMembershipTier.mockResolvedValue("PROFESSIONAL");
    const result = await canCreateGroup("user-1");
    expect(result.allowed).toBe(false);
    expect(result.tierRequired).toBe("TOP_TIER");
  });

  it("emits permission_denied event on deny", async () => {
    mockGetUserMembershipTier.mockResolvedValue("BASIC");
    await canCreateGroup("user-1");
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "member.permission_denied",
      expect.objectContaining({ userId: "user-1", action: "createGroup" }),
    );
  });
});

describe("canPublishArticle", () => {
  it("denies BASIC users", async () => {
    mockGetUserMembershipTier.mockResolvedValue("BASIC");
    const result = await canPublishArticle("user-1");
    expect(result.allowed).toBe(false);
    expect(result.tierRequired).toBe("PROFESSIONAL");
  });

  it("allows PROFESSIONAL users", async () => {
    mockGetUserMembershipTier.mockResolvedValue("PROFESSIONAL");
    const result = await canPublishArticle("user-1");
    expect(result.allowed).toBe(true);
  });

  it("allows TOP_TIER users", async () => {
    mockGetUserMembershipTier.mockResolvedValue("TOP_TIER");
    const result = await canPublishArticle("user-1");
    expect(result.allowed).toBe(true);
  });
});

describe("canAssignGroupLeaders", () => {
  it("allows only TOP_TIER", async () => {
    mockGetUserMembershipTier.mockResolvedValue("TOP_TIER");
    const result = await canAssignGroupLeaders("user-1");
    expect(result.allowed).toBe(true);
  });

  it("denies BASIC", async () => {
    mockGetUserMembershipTier.mockResolvedValue("BASIC");
    const result = await canAssignGroupLeaders("user-1");
    expect(result.allowed).toBe(false);
  });

  it("denies PROFESSIONAL", async () => {
    mockGetUserMembershipTier.mockResolvedValue("PROFESSIONAL");
    const result = await canAssignGroupLeaders("user-1");
    expect(result.allowed).toBe(false);
  });
});

describe("checkPermission", () => {
  it("allows canChat for all tiers", async () => {
    for (const tier of ["BASIC", "PROFESSIONAL", "TOP_TIER"] as const) {
      mockGetUserMembershipTier.mockResolvedValue(tier);
      const result = await checkPermission("user-1", "canChat");
      expect(result.allowed).toBe(true);
    }
  });

  it("denies canCreateGroup for BASIC and PROFESSIONAL with TOP_TIER required", async () => {
    for (const tier of ["BASIC", "PROFESSIONAL"] as const) {
      mockGetUserMembershipTier.mockResolvedValue(tier);
      const result = await checkPermission("user-1", "canCreateGroup");
      expect(result.allowed).toBe(false);
      expect(result.tierRequired).toBe("TOP_TIER");
    }
  });

  it("allows canCreateGroup for TOP_TIER", async () => {
    mockGetUserMembershipTier.mockResolvedValue("TOP_TIER");
    const result = await checkPermission("user-1", "canCreateGroup");
    expect(result.allowed).toBe(true);
  });

  it("handles array permissions (articleVisibility) correctly", async () => {
    mockGetUserMembershipTier.mockResolvedValue("BASIC");
    const basicResult = await checkPermission("user-1", "articleVisibility");
    expect(basicResult.allowed).toBe(false);

    mockGetUserMembershipTier.mockResolvedValue("PROFESSIONAL");
    const proResult = await checkPermission("user-1", "articleVisibility");
    expect(proResult.allowed).toBe(true);

    mockGetUserMembershipTier.mockResolvedValue("TOP_TIER");
    const topResult = await checkPermission("user-1", "articleVisibility");
    expect(topResult.allowed).toBe(true);
  });

  it("denies canPublishArticle for BASIC with PROFESSIONAL required", async () => {
    mockGetUserMembershipTier.mockResolvedValue("BASIC");
    const result = await checkPermission("user-1", "canPublishArticle");
    expect(result.allowed).toBe(false);
    expect(result.tierRequired).toBe("PROFESSIONAL");
  });
});

describe("getTierUpgradeMessage", () => {
  it("returns specific i18n key for known actions", () => {
    expect(getTierUpgradeMessage("createGroup", "TOP_TIER")).toBe(
      "Permissions.groupCreationRequired",
    );
    expect(getTierUpgradeMessage("publishArticle", "PROFESSIONAL")).toBe(
      "Permissions.articlePublishRequired",
    );
    expect(getTierUpgradeMessage("assignGroupLeaders", "TOP_TIER")).toBe(
      "Permissions.groupLeaderRequired",
    );
  });

  it("returns generic i18n key for unknown actions", () => {
    expect(getTierUpgradeMessage("someUnknownAction", "TOP_TIER")).toBe(
      "Permissions.upgradeRequired",
    );
  });
});

describe("canCreateFeedPost", () => {
  it("returns { allowed: false } for BASIC tier", async () => {
    mockGetUserMembershipTier.mockResolvedValue("BASIC");
    const result = await canCreateFeedPost("user-1");
    expect(result.allowed).toBe(false);
  });

  it("returns { allowed: true } for PROFESSIONAL tier", async () => {
    mockGetUserMembershipTier.mockResolvedValue("PROFESSIONAL");
    const result = await canCreateFeedPost("user-1");
    expect(result.allowed).toBe(true);
  });

  it("returns { allowed: true } for TOP_TIER tier", async () => {
    mockGetUserMembershipTier.mockResolvedValue("TOP_TIER");
    const result = await canCreateFeedPost("user-1");
    expect(result.allowed).toBe(true);
  });

  it("emits member.permission_denied for BASIC tier", async () => {
    mockGetUserMembershipTier.mockResolvedValue("BASIC");
    await canCreateFeedPost("user-1");
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "member.permission_denied",
      expect.objectContaining({ userId: "user-1", action: "createFeedPost" }),
    );
  });
});

describe("getMaxFeedPostsPerWeek", () => {
  it("returns 0 for BASIC", () => {
    expect(getMaxFeedPostsPerWeek("BASIC")).toBe(0);
  });

  it("returns 1 for PROFESSIONAL", () => {
    expect(getMaxFeedPostsPerWeek("PROFESSIONAL")).toBe(1);
  });

  it("returns 999 for TOP_TIER", () => {
    expect(getMaxFeedPostsPerWeek("TOP_TIER")).toBe(999);
  });
});

describe("PERMISSION_MATRIX feed post fields", () => {
  it("BASIC has maxFeedPostsPerWeek: 0", async () => {
    mockGetUserMembershipTier.mockResolvedValue("BASIC");
    const perms = await getPermissions("user-1");
    expect(perms.maxFeedPostsPerWeek).toBe(0);
    expect(perms.canCreateFeedPost).toBe(false);
  });

  it("PROFESSIONAL has maxFeedPostsPerWeek: 1", async () => {
    mockGetUserMembershipTier.mockResolvedValue("PROFESSIONAL");
    const perms = await getPermissions("user-1");
    expect(perms.maxFeedPostsPerWeek).toBe(1);
    expect(perms.canCreateFeedPost).toBe(true);
  });

  it("TOP_TIER has maxFeedPostsPerWeek: 999", async () => {
    mockGetUserMembershipTier.mockResolvedValue("TOP_TIER");
    const perms = await getPermissions("user-1");
    expect(perms.maxFeedPostsPerWeek).toBe(999);
    expect(perms.canCreateFeedPost).toBe(true);
  });
});

describe("Permission matrix completeness", () => {
  const tiers = ["BASIC", "PROFESSIONAL", "TOP_TIER"] as const;
  const permissions = [
    "canChat",
    "canJoinPublicGroups",
    "canViewArticles",
    "canAttendEvents",
    "canUseMemberDirectory",
    "canPublishArticle",
    "canCreateGroup",
    "canAssignGroupLeaders",
    "maxArticlesPerWeek",
    "articleVisibility",
    "canCreateFeedPost",
    "maxFeedPostsPerWeek",
  ] as const;

  it.each(tiers)("tier %s has all permission keys defined", async (tier) => {
    mockGetUserMembershipTier.mockResolvedValue(tier);
    const perms = await getPermissions("user-1");
    for (const key of permissions) {
      expect(perms[key]).toBeDefined();
    }
  });
});
