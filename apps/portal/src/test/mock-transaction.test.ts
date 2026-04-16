// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/db", () => ({
  db: { transaction: vi.fn() },
}));

import { db } from "@igbo/db";
import { installMockTransaction } from "./mock-transaction";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Basic invocation
// ---------------------------------------------------------------------------
describe("installMockTransaction — basic", () => {
  it("installs a mockImplementation on db.transaction", () => {
    installMockTransaction();
    expect(vi.mocked(db.transaction).mock.calls.length).toBe(0);
    // The mock should be set up but not yet called
    expect(db.transaction).toBeTypeOf("function");
  });

  it("runs the callback with the default tx", async () => {
    installMockTransaction();
    let cbCalled = false;
    await vi.mocked(db.transaction)(async (_tx: unknown) => {
      cbCalled = true;
    });
    expect(cbCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pattern A — insert + update capture (no returning)
// ---------------------------------------------------------------------------
describe("Pattern A — insert + update capture", () => {
  it("captures insert table and values", async () => {
    const { inserts } = installMockTransaction();
    const fakeTable = { id: "col_id" };
    const fakeData = { id: "row-1", name: "Test" };

    await vi.mocked(db.transaction)(async (tx: unknown) => {
      const t = tx as { insert: (table: unknown) => { values: (data: unknown) => Promise<void> } };
      await t.insert(fakeTable).values(fakeData);
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.table).toBe(fakeTable);
    expect(inserts[0]?.values).toEqual(fakeData);
  });

  it("captures update table and set data", async () => {
    const { updates } = installMockTransaction();
    const fakeTable = { id: "col_id" };
    const fakeSet = { status: "active" };

    await vi.mocked(db.transaction)(async (tx: unknown) => {
      const t = tx as {
        update: (table: unknown) => {
          set: (data: unknown) => { where: () => { returning: () => Promise<unknown[]> } };
        };
      };
      await t.update(fakeTable).set(fakeSet).where().returning();
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]?.table).toBe(fakeTable);
    expect(updates[0]?.set).toEqual(fakeSet);
  });

  it("captures multiple inserts in order", async () => {
    const { inserts } = installMockTransaction();
    const tableA = { id: "a" };
    const tableB = { id: "b" };

    await vi.mocked(db.transaction)(async (tx: unknown) => {
      const t = tx as { insert: (table: unknown) => { values: (data: unknown) => Promise<void> } };
      await t.insert(tableA).values({ id: "1" });
      await t.insert(tableB).values({ id: "2" });
    });

    expect(inserts).toHaveLength(2);
    expect(inserts[0]?.table).toBe(tableA);
    expect(inserts[1]?.table).toBe(tableB);
  });
});

// ---------------------------------------------------------------------------
// Pattern B — insert with configurable .returning()
// ---------------------------------------------------------------------------
describe("Pattern B — insert with returning", () => {
  it("insert.values() is directly awaitable (no .returning() needed)", async () => {
    installMockTransaction();

    await vi.mocked(db.transaction)(async (tx: unknown) => {
      const t = tx as { insert: (table: unknown) => { values: (data: unknown) => Promise<void> } };
      // Should not throw even without .returning()
      await t.insert({}).values({});
    });
  });

  it("insert.values().returning() resolves to default empty array", async () => {
    installMockTransaction();
    let result: unknown[] = [];

    await vi.mocked(db.transaction)(async (tx: unknown) => {
      const t = tx as {
        insert: (table: unknown) => {
          values: (data: unknown) => Promise<unknown> & { returning: () => Promise<unknown[]> };
        };
      };
      result = await t.insert({}).values({}).returning();
    });

    expect(result).toEqual([]);
  });

  it("insert.values().returning() resolves to insertReturning option", async () => {
    const mockRow = { id: "row-1", status: "open" };
    installMockTransaction({ insertReturning: [mockRow] });
    let result: unknown[] = [];

    await vi.mocked(db.transaction)(async (tx: unknown) => {
      const t = tx as {
        insert: (table: unknown) => {
          values: (data: unknown) => Promise<unknown> & { returning: () => Promise<unknown[]> };
        };
      };
      result = await t.insert({}).values({}).returning();
    });

    expect(result).toEqual([mockRow]);
  });

  it("setInsertReturning updates the returning value dynamically", async () => {
    const handle = installMockTransaction();
    const newRow = { id: "row-updated" };
    handle.setInsertReturning([newRow]);
    let result: unknown[] = [];

    await vi.mocked(db.transaction)(async (tx: unknown) => {
      const t = tx as {
        insert: (table: unknown) => {
          values: (data: unknown) => Promise<unknown> & { returning: () => Promise<unknown[]> };
        };
      };
      result = await t.insert({}).values({}).returning();
    });

    expect(result).toEqual([newRow]);
  });
});

// ---------------------------------------------------------------------------
// Update returning
// ---------------------------------------------------------------------------
describe("update returning configuration", () => {
  it("update returns default [{ id: 'test-id' }]", async () => {
    installMockTransaction();
    let result: unknown[] = [];

    await vi.mocked(db.transaction)(async (tx: unknown) => {
      const t = tx as {
        update: (table: unknown) => {
          set: (data: unknown) => { where: () => { returning: () => Promise<unknown[]> } };
        };
      };
      result = await t.update({}).set({}).where().returning();
    });

    expect(result).toEqual([{ id: "test-id" }]);
  });

  it("setUpdateReturning updates the returning value dynamically", async () => {
    const handle = installMockTransaction();
    handle.setUpdateReturning([]);
    let result: unknown[] = [{ placeholder: true }];

    await vi.mocked(db.transaction)(async (tx: unknown) => {
      const t = tx as {
        update: (table: unknown) => {
          set: (data: unknown) => { where: () => { returning: () => Promise<unknown[]> } };
        };
      };
      result = await t.update({}).set({}).where().returning();
    });

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Custom tx (Pattern D/E)
// ---------------------------------------------------------------------------
describe("custom tx override", () => {
  it("uses the provided tx object instead of the default", async () => {
    const customResult = { custom: true };
    const customTx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockResolvedValue([customResult]),
      }),
    };
    installMockTransaction({ tx: customTx });

    let result: unknown;
    await vi.mocked(db.transaction)(async (tx: unknown) => {
      const t = tx as typeof customTx;
      result = await t.select().from();
    });

    expect(result).toEqual([customResult]);
    expect(customTx.select).toHaveBeenCalledTimes(1);
  });

  it("flat-chaining tx (Pattern D) works via custom tx", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "ver-1" }]);
    const flatTx = {
      update: vi.fn(),
      set: vi.fn(),
      where: vi.fn(),
      returning,
      insert: vi.fn(),
      values: vi.fn().mockResolvedValue(undefined),
    };
    flatTx.update.mockReturnValue(flatTx);
    flatTx.set.mockReturnValue(flatTx);
    flatTx.where.mockReturnValue(flatTx);
    flatTx.insert.mockReturnValue(flatTx);
    installMockTransaction({ tx: flatTx });

    let result: unknown;
    await vi.mocked(db.transaction)(async (tx: unknown) => {
      const t = tx as typeof flatTx;
      result = await t
        .update({} as never)
        .set({} as never)
        .where()
        .returning();
    });

    expect(result).toEqual([{ id: "ver-1" }]);
    expect(flatTx.update).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Re-installation: multiple calls in same test (beforeEach pattern)
// ---------------------------------------------------------------------------
describe("re-installation", () => {
  it("replaces the previous mock when called again", async () => {
    installMockTransaction({ insertReturning: [{ id: "first" }] });
    const handle2 = installMockTransaction({ insertReturning: [{ id: "second" }] });
    let result: unknown[] = [];

    await vi.mocked(db.transaction)(async (tx: unknown) => {
      const t = tx as {
        insert: (table: unknown) => {
          values: (data: unknown) => Promise<unknown> & { returning: () => Promise<unknown[]> };
        };
      };
      result = await t.insert({}).values({}).returning();
    });

    // Second installMockTransaction should win
    expect(result).toEqual([{ id: "second" }]);
    expect(handle2.inserts).toHaveLength(1);
  });
});
