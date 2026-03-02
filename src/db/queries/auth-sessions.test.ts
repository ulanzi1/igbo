// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

function makeInsertChain(result: unknown) {
  return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(result) }) };
}

function makeSelectChainLimitTerminal(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

function makeSelectChainWhereTerminal(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
}

function makeSelectChainOrderByTerminal(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(result),
  };
}

function makeDeleteChain() {
  return { where: vi.fn().mockResolvedValue(undefined) };
}

function makeUpdateChain() {
  return { set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) };
}

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock("@/db/schema/auth-sessions", () => ({
  authSessions: {
    id: "id",
    sessionToken: "sessionToken",
    userId: "userId",
    expires: "expires",
    createdAt: "createdAt",
    lastActiveAt: "lastActiveAt",
  },
}));

import {
  createSession,
  findSessionByToken,
  findSessionById,
  findActiveSessionsByUserId,
  deleteSessionByToken,
  deleteSessionById,
  deleteOldestSessionForUser,
  countActiveSessionsForUser,
  deleteAllSessionsForUser,
  touchSession,
} from "./auth-sessions";

beforeEach(() => {
  mockInsert.mockReset();
  mockSelect.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
});

describe("createSession", () => {
  it("inserts and returns the session", async () => {
    const session = { id: "s1", sessionToken: "token", userId: "u1" };
    mockInsert.mockReturnValue(makeInsertChain([session]));

    const result = await createSession({
      sessionToken: "token",
      userId: "u1",
      expires: new Date(),
    } as never);
    expect(result).toEqual(session);
  });

  it("returns null when insert returns empty", async () => {
    mockInsert.mockReturnValue(makeInsertChain([]));

    const result = await createSession({
      sessionToken: "t",
      userId: "u1",
      expires: new Date(),
    } as never);
    expect(result).toBeNull();
  });
});

describe("findSessionByToken", () => {
  it("returns session when found", async () => {
    const session = { id: "s1", sessionToken: "tok" };
    mockSelect.mockReturnValue(makeSelectChainLimitTerminal([session]));

    const result = await findSessionByToken("tok");
    expect(result).toEqual(session);
  });

  it("returns null when not found", async () => {
    mockSelect.mockReturnValue(makeSelectChainLimitTerminal([]));

    const result = await findSessionByToken("none");
    expect(result).toBeNull();
  });
});

describe("findSessionById", () => {
  it("returns session when found", async () => {
    const session = { id: "s1" };
    mockSelect.mockReturnValue(makeSelectChainLimitTerminal([session]));

    const result = await findSessionById("s1");
    expect(result).toEqual(session);
  });
});

describe("findActiveSessionsByUserId", () => {
  it("returns active sessions ordered by createdAt", async () => {
    const sessions = [{ id: "s1" }, { id: "s2" }];
    mockSelect.mockReturnValue(makeSelectChainOrderByTerminal(sessions));

    const result = await findActiveSessionsByUserId("u1");
    expect(result).toEqual(sessions);
  });
});

describe("deleteSessionByToken", () => {
  it("deletes session by token", async () => {
    const chain = makeDeleteChain();
    mockDelete.mockReturnValue(chain);

    await deleteSessionByToken("tok");
    expect(chain.where).toHaveBeenCalled();
  });
});

describe("deleteSessionById", () => {
  it("deletes session by id and userId", async () => {
    const chain = makeDeleteChain();
    mockDelete.mockReturnValue(chain);

    await deleteSessionById("s1", "u1");
    expect(chain.where).toHaveBeenCalled();
  });
});

describe("deleteOldestSessionForUser", () => {
  it("finds oldest session and deletes it", async () => {
    const oldest = { id: "s-old", sessionToken: "old-tok" };
    // First call: select oldest
    mockSelect.mockReturnValueOnce(makeSelectChainLimitTerminal([oldest]));
    // Second call: delete
    mockDelete.mockReturnValue(makeDeleteChain());

    const result = await deleteOldestSessionForUser("u1");
    expect(result).toEqual(oldest);
  });

  it("returns null when user has no sessions", async () => {
    mockSelect.mockReturnValue(makeSelectChainLimitTerminal([]));

    const result = await deleteOldestSessionForUser("u1");
    expect(result).toBeNull();
  });
});

describe("countActiveSessionsForUser", () => {
  it("returns count of active sessions", async () => {
    mockSelect.mockReturnValue(
      makeSelectChainWhereTerminal([{ id: "1" }, { id: "2" }, { id: "3" }]),
    );

    const count = await countActiveSessionsForUser("u1");
    expect(count).toBe(3);
  });
});

describe("deleteAllSessionsForUser", () => {
  it("deletes all sessions for user", async () => {
    const chain = makeDeleteChain();
    mockDelete.mockReturnValue(chain);

    await deleteAllSessionsForUser("u1");
    expect(chain.where).toHaveBeenCalled();
  });
});

describe("touchSession", () => {
  it("updates lastActiveAt for the session", async () => {
    const chain = makeUpdateChain();
    mockUpdate.mockReturnValue(chain);

    await touchSession("tok");
    expect(chain.set).toHaveBeenCalled();
  });
});
