// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockSelect = vi.fn();
const mockInsert = vi.fn();

function makeSelectChainWhereTerminal(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
}

function makeInsertChain() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

vi.mock("../index", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

vi.mock("../schema/auth-users", () => ({
  authUsers: {
    email: "email",
    deletedAt: "deletedAt",
  },
}));

import { findAdminByEmail, insertAdminUser } from "./admin-queries";

beforeEach(() => {
  mockSelect.mockReset();
  mockInsert.mockReset();
});

describe("findAdminByEmail", () => {
  it("returns matching admin users", async () => {
    const rows = [{ id: "a1", email: "admin@test.com", role: "ADMIN" }];
    mockSelect.mockReturnValue(makeSelectChainWhereTerminal(rows));

    const result = await findAdminByEmail("admin@test.com");
    expect(result).toEqual(rows);
  });

  it("returns empty array when no match", async () => {
    mockSelect.mockReturnValue(makeSelectChainWhereTerminal([]));

    const result = await findAdminByEmail("nonexistent@test.com");
    expect(result).toEqual([]);
  });
});

describe("insertAdminUser", () => {
  it("inserts a new admin user", async () => {
    const chain = makeInsertChain();
    mockInsert.mockReturnValue(chain);

    await insertAdminUser("admin@test.com");
    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "admin@test.com",
        role: "ADMIN",
        accountStatus: "APPROVED",
        membershipTier: "TOP_TIER",
      }),
    );
  });
});
