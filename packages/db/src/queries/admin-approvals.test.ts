// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockSelect = vi.fn();
const mockUpdate = vi.fn();

/**
 * Creates a select chain where `.limit()` is the terminal (resolves to result).
 * Used for queries like `db.select().from().where().limit(1)`.
 */
function makeSelectChainLimitTerminal(result: unknown) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
    offset: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

/**
 * Creates a select chain where `.offset()` is the terminal.
 * Used for paginated queries like `db.select().from().where().orderBy().limit().offset()`.
 */
function makeSelectChainOffsetTerminal(result: unknown) {
  const limitChain = {
    offset: vi.fn().mockResolvedValue(result),
  };
  const chain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue(limitChain),
  };
  return chain;
}

/**
 * Creates a select chain where `.where()` is the terminal.
 * Used for count queries like `db.select({ count }).from().where()`.
 */
function makeSelectChainWhereTerminal(result: unknown) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

function makeUpdateChain(result: unknown) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

vi.mock("../index", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("../schema/auth-users", () => ({
  authUsers: {
    id: "id",
    email: "email",
    emailVerified: "emailVerified",
    name: "name",
    phone: "phone",
    locationCity: "locationCity",
    locationState: "locationState",
    locationCountry: "locationCountry",
    culturalConnection: "culturalConnection",
    reasonForJoining: "reasonForJoining",
    referralName: "referralName",
    consentGivenAt: "consentGivenAt",
    consentIp: "consentIp",
    consentVersion: "consentVersion",
    image: "image",
    accountStatus: "accountStatus",
    passwordHash: "passwordHash",
    role: "role",
    membershipTier: "membershipTier",
    languagePreference: "languagePreference",
    scheduledDeletionAt: "scheduledDeletionAt",
    adminNotes: "adminNotes",
    deletedAt: "deletedAt",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
}));

vi.mock("../schema/community-profiles", () => ({
  communityProfiles: {
    userId: "userId",
    profileCompletedAt: "profileCompletedAt",
  },
}));

import { listApplications, getApplicationById, updateApplicationStatus } from "./admin-approvals";

beforeEach(() => {
  mockSelect.mockReset();
  mockUpdate.mockReset();
});

describe("listApplications", () => {
  it("returns paginated applications with default options", async () => {
    const row = {
      id: "u1",
      email: "u1@test.com",
      name: "User 1",
      accountStatus: "PENDING_APPROVAL",
      profileCompletedAt: null,
    };
    // First select() call: paginated rows — offset terminal
    const rowsChain = makeSelectChainOffsetTerminal([row]);
    // Second select() call: count — where terminal
    const countChain = makeSelectChainWhereTerminal([{ count: 1 }]);
    mockSelect.mockReturnValueOnce(rowsChain);
    mockSelect.mockReturnValueOnce(countChain);

    const result = await listApplications();

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
  });

  it("marks APPROVED members without profile as profileIncomplete", async () => {
    const row = {
      id: "u1",
      accountStatus: "APPROVED",
      profileCompletedAt: null,
    };
    const rowsChain = makeSelectChainOffsetTerminal([row]);
    const countChain = makeSelectChainWhereTerminal([{ count: 1 }]);
    mockSelect.mockReturnValueOnce(rowsChain);
    mockSelect.mockReturnValueOnce(countChain);

    const result = await listApplications({ status: "APPROVED" });

    expect(result.data[0].profileIncomplete).toBe(true);
  });

  it("marks APPROVED members with profile as not profileIncomplete", async () => {
    const row = {
      id: "u1",
      accountStatus: "APPROVED",
      profileCompletedAt: new Date(),
    };
    const rowsChain = makeSelectChainOffsetTerminal([row]);
    const countChain = makeSelectChainWhereTerminal([{ count: 1 }]);
    mockSelect.mockReturnValueOnce(rowsChain);
    mockSelect.mockReturnValueOnce(countChain);

    const result = await listApplications({ status: "APPROVED" });

    expect(result.data[0].profileIncomplete).toBe(false);
  });

  it("applies pagination offset correctly", async () => {
    const rowsChain = makeSelectChainOffsetTerminal([]);
    const countChain = makeSelectChainWhereTerminal([{ count: 0 }]);
    mockSelect.mockReturnValueOnce(rowsChain);
    mockSelect.mockReturnValueOnce(countChain);

    await listApplications({ page: 3, pageSize: 10 });

    const limitReturn = rowsChain.limit.mock.results[0].value;
    expect(limitReturn.offset).toHaveBeenCalledWith(20);
  });
});

describe("getApplicationById", () => {
  it("returns the application when found", async () => {
    const row = { id: "u1", email: "u1@test.com" };
    // getApplicationById uses: select().from().where().limit(1) — limit terminal
    const chain = makeSelectChainLimitTerminal([row]);
    mockSelect.mockReturnValueOnce(chain);

    const result = await getApplicationById("u1");

    expect(result).toEqual(row);
  });

  it("returns null when not found", async () => {
    const chain = makeSelectChainLimitTerminal([]);
    mockSelect.mockReturnValueOnce(chain);

    const result = await getApplicationById("nonexistent");

    expect(result).toBeNull();
  });
});

describe("updateApplicationStatus", () => {
  it("updates status and returns the updated row", async () => {
    const updated = { id: "u1", accountStatus: "APPROVED" };
    const chain = makeUpdateChain([updated]);
    mockUpdate.mockReturnValueOnce(chain);

    const result = await updateApplicationStatus("u1", "APPROVED");

    expect(result).toEqual(updated);
  });

  it("includes adminNotes when provided", async () => {
    const chain = makeUpdateChain([{ id: "u1" }]);
    mockUpdate.mockReturnValueOnce(chain);

    await updateApplicationStatus("u1", "INFO_REQUESTED", "Need more info");

    const setArg = chain.set.mock.calls[0][0];
    expect(setArg.adminNotes).toBe("Need more info");
  });

  it("returns null when row not found", async () => {
    const chain = makeUpdateChain([]);
    mockUpdate.mockReturnValueOnce(chain);

    const result = await updateApplicationStatus("nonexistent", "REJECTED");

    expect(result).toBeNull();
  });
});
