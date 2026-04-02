// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();

function makeInsertChain(result: unknown) {
  return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(result) }) };
}

function makeSelectChainLimitTerminal(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

function makeSelectChainWhereTerminal(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
}

function makeUpdateChain() {
  return { set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) };
}

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@/db/schema/gdpr", () => ({
  gdprExportRequests: {
    id: "id",
    userId: "userId",
    downloadToken: "downloadToken",
  },
}));

vi.mock("@/db/schema/auth-users", () => ({
  authUsers: {
    accountStatus: "accountStatus",
    scheduledDeletionAt: "scheduledDeletionAt",
  },
}));

import {
  createExportRequest,
  getExportRequestByToken,
  getUserExportRequests,
  updateExportRequest,
  findAccountsPendingAnonymization,
} from "./gdpr";

beforeEach(() => {
  mockInsert.mockReset();
  mockSelect.mockReset();
  mockUpdate.mockReset();
});

describe("createExportRequest", () => {
  it("creates and returns an export request", async () => {
    const row = { id: "exp1", userId: "u1" };
    mockInsert.mockReturnValue(makeInsertChain([row]));

    const result = await createExportRequest("u1");
    expect(result).toEqual(row);
  });

  it("throws when insert returns no row", async () => {
    mockInsert.mockReturnValue(makeInsertChain([]));

    await expect(createExportRequest("u1")).rejects.toThrow("Failed to create export request");
  });
});

describe("getExportRequestByToken", () => {
  it("returns request when found", async () => {
    const row = { id: "exp1", downloadToken: "tok" };
    mockSelect.mockReturnValue(makeSelectChainLimitTerminal([row]));

    const result = await getExportRequestByToken("tok");
    expect(result).toEqual(row);
  });

  it("returns null when not found", async () => {
    mockSelect.mockReturnValue(makeSelectChainLimitTerminal([]));

    const result = await getExportRequestByToken("missing");
    expect(result).toBeNull();
  });
});

describe("getUserExportRequests", () => {
  it("returns all export requests for a user", async () => {
    const rows = [{ id: "exp1" }, { id: "exp2" }];
    mockSelect.mockReturnValue(makeSelectChainWhereTerminal(rows));

    const result = await getUserExportRequests("u1");
    expect(result).toEqual(rows);
  });
});

describe("updateExportRequest", () => {
  it("updates the export request", async () => {
    const chain = makeUpdateChain();
    mockUpdate.mockReturnValue(chain);

    await updateExportRequest("exp1", { status: "ready" } as never);
    expect(chain.set).toHaveBeenCalled();
  });
});

describe("findAccountsPendingAnonymization", () => {
  it("returns accounts with PENDING_DELETION status past scheduled date", async () => {
    const rows = [{ id: "u1", accountStatus: "PENDING_DELETION" }];
    mockSelect.mockReturnValue(makeSelectChainWhereTerminal(rows));

    const result = await findAccountsPendingAnonymization();
    expect(result).toEqual(rows);
  });
});
