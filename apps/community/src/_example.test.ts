// @vitest-environment node
/**
 * Reference test for community server-side tests.
 * Demonstrates: @vitest-environment node override, @/env mock, @igbo/db mock,
 * dynamic route import pattern.
 * Copy and rename to start a new route/service test.
 * Not for component/UI tests — those use the default jsdom environment
 * without the directive.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
// Add required env vars your code accesses (e.g., DATABASE_URL, REDIS_URL)
vi.mock("@/env", () => ({ env: {} }));

const mockSelect = vi.fn();

vi.mock("@igbo/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("example: your feature under test", () => {
  it("demonstrates @igbo/db mock with select chain", async () => {
    const mockRow = { id: "1", name: "test" };
    const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([mockRow]) };
    mockSelect.mockReturnValue(chain);

    // Replace with: const { yourFunction } = await import("./your-module");
    // const result = await yourFunction();
    const result = await mockSelect().from().where();

    expect(result).toEqual([mockRow]);
  });

  it("demonstrates dynamic import pattern for route tests", async () => {
    // In real route tests, use: const { GET } = await import("./route");
    // The module is vi.mock'd above so dynamic import resolves to the mock.
    const db = await import("@igbo/db");

    expect(db.db).toBeDefined();
    expect(db.db.select).toBeDefined();
  });
});
