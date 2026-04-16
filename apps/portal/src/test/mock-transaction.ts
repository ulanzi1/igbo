/**
 * Shared db.transaction mock utility for portal tests.
 *
 * Absorbs the single `any` suppression needed to handle PgTransaction generic
 * widening (which changes with each new schema added to packages/db), so
 * consumer test files never need type casts or eslint-disable comments.
 *
 * Patterns covered:
 *   A  — insert + update capture (no returning required)
 *   B  — insert with configurable .returning() (insert.values() is also directly awaitable)
 *   C/D/E — complex patterns via opts.tx custom override
 *
 * Usage:
 *   // Simple: just run the callback
 *   installMockTransaction();
 *
 *   // Capture inserts/updates
 *   const { inserts, updates } = installMockTransaction();
 *   await someService("id", "admin-1");
 *   expect(inserts[0]?.values).toMatchObject({ status: "approved" });
 *
 *   // With insert returning value (Pattern B)
 *   installMockTransaction({ insertReturning: [mockRow] });
 *
 *   // Reconfigure returning mid-test
 *   const handle = installMockTransaction();
 *   handle.setInsertReturning([{ ...BASE_FLAG, severity: "high" }]);
 *   handle.setUpdateReturning([]);  // simulate race condition empty rowset
 *
 *   // Custom tx object (complex patterns D/E)
 *   installMockTransaction({ tx: myFlatChainingTx });
 */
import { vi } from "vitest";
import { db } from "@igbo/db";

export interface CapturedInsert {
  table: unknown;
  values: unknown;
}

export interface CapturedUpdate {
  table: unknown;
  set: unknown;
}

export interface MockTransactionHandle {
  /** All insert(table).values(data) calls recorded during the transaction */
  inserts: CapturedInsert[];
  /** All update(table).set(data) calls recorded during the transaction */
  updates: CapturedUpdate[];
  /** Replace the rows returned by insert().values().returning() */
  setInsertReturning(rows: unknown[]): void;
  /** Replace the rows returned by update().set().where().returning() */
  setUpdateReturning(rows: unknown[]): void;
}

export interface MockTransactionOptions {
  /**
   * Initial rows returned by insert().values().returning().
   * Default: [] (empty — callers use setInsertReturning() to change per-test)
   */
  insertReturning?: unknown[];
  /**
   * Initial rows returned by update().set().where().returning().
   * Default: [{ id: "test-id" }] (non-empty simulates a successful UPDATE)
   */
  updateReturning?: unknown[];
  /**
   * Fully override the tx object passed to the transaction callback.
   * Use for complex patterns (flat chaining, table-aware dispatch, multi-operation).
   * When provided, `insertReturning` and `updateReturning` are ignored.
   */
  tx?: unknown;
}

/**
 * Installs db.transaction mock for the current test.
 * Returns a handle for inspecting captured calls and reconfiguring return values.
 */
export function installMockTransaction(opts: MockTransactionOptions = {}): MockTransactionHandle {
  const inserts: CapturedInsert[] = [];
  const updates: CapturedUpdate[] = [];
  let insertReturningRows: unknown[] = opts.insertReturning ?? [];
  let updateReturningRows: unknown[] = opts.updateReturning ?? [{ id: "test-id" }];

  const defaultTx = {
    insert: (table: unknown) => ({
      values: (data: unknown) => {
        inserts.push({ table, values: data });
        // Returned value is both directly awaitable (Pattern A) AND has .returning()
        // (Pattern B/A3). Object.assign merges returning() onto the Promise.
        return Object.assign(Promise.resolve(undefined), {
          returning: () => Promise.resolve(insertReturningRows),
        });
      },
    }),
    update: (table: unknown) => ({
      set: (data: unknown) => {
        updates.push({ table, set: data });
        return {
          where: () => ({
            returning: () => Promise.resolve(updateReturningRows),
          }),
        };
      },
    }),
  };

  const tx = opts.tx ?? defaultTx;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgTransaction generic widens with each schema addition; single suppression here eliminates (cb: any) / (tx: never) / (tx as never) in all consumer test files
  vi.mocked(db.transaction).mockImplementation(async (fn: any) => fn(tx));

  return {
    inserts,
    updates,
    setInsertReturning: (rows: unknown[]) => {
      insertReturningRows = rows;
    },
    setUpdateReturning: (rows: unknown[]) => {
      updateReturningRows = rows;
    },
  };
}
