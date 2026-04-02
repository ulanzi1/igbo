// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockReturning = vi.fn();
const mockOnConflictDoUpdate = vi.fn(() => ({ returning: mockReturning }));
const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
const mockOrderBy = vi.fn();
const mockSelectWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
const mockFrom = vi.fn(() => ({ where: mockSelectWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockDeleteWhere = vi.fn();
const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }));
const mockInsert = vi.fn(() => ({ values: mockValues }));

vi.mock("../index", () => ({
  db: {
    get insert() {
      return mockInsert;
    },
    get delete() {
      return mockDelete;
    },
    get select() {
      return mockSelect;
    },
  },
}));

vi.mock("../schema/community-profiles", () => ({
  communitySocialLinks: {
    userId: "user_id",
    provider: "provider",
    linkedAt: "linked_at",
  },
}));

import {
  upsertSocialLink,
  deleteSocialLink,
  getSocialLinksByUserId,
} from "./community-social-links";

beforeEach(() => {
  vi.clearAllMocks();
  mockReturning.mockResolvedValue([{ id: "sl1" }]);
  mockOrderBy.mockResolvedValue([]);
  mockDeleteWhere.mockResolvedValue(undefined);
});

describe("upsertSocialLink", () => {
  it("inserts with onConflictDoUpdate and returns the link", async () => {
    mockReturning.mockResolvedValue([{ id: "sl1", provider: "FACEBOOK" }]);

    const result = await upsertSocialLink("user-1", "FACEBOOK", {
      providerDisplayName: "Eze",
      providerProfileUrl: "https://facebook.com/eze",
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", provider: "FACEBOOK" }),
    );
    expect(mockOnConflictDoUpdate).toHaveBeenCalled();
    expect(result).toEqual({ id: "sl1", provider: "FACEBOOK" });
  });

  it("returns null when no rows returned", async () => {
    mockReturning.mockResolvedValue([]);

    const result = await upsertSocialLink("user-1", "LINKEDIN", {
      providerDisplayName: "Eze",
      providerProfileUrl: "https://linkedin.com/in/eze",
    });

    expect(result).toBeNull();
  });
});

describe("deleteSocialLink", () => {
  it("calls delete with where clause", async () => {
    await deleteSocialLink("user-1", "TWITTER");

    expect(mockDelete).toHaveBeenCalled();
    expect(mockDeleteWhere).toHaveBeenCalled();
  });
});

describe("getSocialLinksByUserId", () => {
  it("selects links ordered by linkedAt", async () => {
    const links = [{ id: "sl1", provider: "INSTAGRAM" }];
    mockOrderBy.mockResolvedValue(links);

    const result = await getSocialLinksByUserId("user-1");

    expect(mockSelect).toHaveBeenCalled();
    expect(mockOrderBy).toHaveBeenCalled();
    expect(result).toEqual(links);
  });
});
