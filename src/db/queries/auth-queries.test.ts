// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@/db/schema/auth-users", () => ({
  authUsers: {
    id: "id",
    email: "email",
    languagePreference: "language_preference",
    deletedAt: "deleted_at",
    updatedAt: "updated_at",
  },
  authVerificationTokens: {
    id: "id",
    userId: "user_id",
    tokenHash: "token_hash",
    expiresAt: "expires_at",
    usedAt: "used_at",
  },
}));

import { updateLanguagePreference, getLanguagePreference } from "./auth-queries";

const USER_ID = "user-uuid-1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateLanguagePreference", () => {
  it("calls db.update on authUsers with locale and updatedAt", async () => {
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    await updateLanguagePreference(USER_ID, "ig");

    expect(mockUpdate).toHaveBeenCalled();
    const setCall = mockSet.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setCall).toMatchObject({ languagePreference: "ig" });
    expect(setCall.updatedAt).toBeInstanceOf(Date);
    expect(mockWhere).toHaveBeenCalled();
  });

  it("updates with 'en' locale correctly", async () => {
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    await updateLanguagePreference(USER_ID, "en");

    const setCall = mockSet.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setCall).toMatchObject({ languagePreference: "en" });
  });
});

describe("getLanguagePreference", () => {
  it("returns 'ig' when user has ig preference", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ languagePreference: "ig" }]),
        }),
      }),
    });

    const pref = await getLanguagePreference(USER_ID);
    expect(pref).toBe("ig");
  });

  it("returns 'en' when user has en preference", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ languagePreference: "en" }]),
        }),
      }),
    });

    const pref = await getLanguagePreference(USER_ID);
    expect(pref).toBe("en");
  });

  it("returns 'en' as fallback when user not found", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const pref = await getLanguagePreference(USER_ID);
    expect(pref).toBe("en");
  });

  it("returns 'en' as fallback for unknown preference value", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ languagePreference: "fr" }]),
        }),
      }),
    });

    const pref = await getLanguagePreference(USER_ID);
    expect(pref).toBe("en");
  });
});
