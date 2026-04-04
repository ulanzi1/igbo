// @vitest-environment node
/**
 * Reference test for @igbo/db query tests.
 * Demonstrates: server-only bypass, db mock via ../index, schema column mock.
 * Copy and rename to start a new query test.
 * Not for component/UI tests — those use jsdom.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../index", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

// Replace with your actual schema import path and column names
vi.mock("../schema/my-table", () => ({
  myTable: {
    id: "id",
    name: "name",
    createdAt: "created_at",
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("example: your feature under test", () => {
  it("demonstrates db.select chain mock", async () => {
    const mockRow = { id: "1", name: "test" };
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockRow]),
    };
    mockSelect.mockReturnValue(chain);

    // Replace with: const result = await yourQueryFunction(args);
    const result = await mockSelect().from().where().limit();

    expect(result).toEqual([mockRow]);
  });

  it("demonstrates db.update chain mock", async () => {
    const chain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ id: "1" }]),
    };
    mockUpdate.mockReturnValue(chain);

    // Replace with: const result = await yourUpdateFunction(args);
    const result = await mockUpdate().set().where();

    expect(result).toEqual([{ id: "1" }]);
  });
});
