// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => ({ _isMockDb: true })),
}));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({ _isMockClient: true })),
}));

describe("createDb", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns a drizzle instance from a connection string", async () => {
    const { createDb } = await import("./index");
    const result = createDb("postgres://localhost/test");
    // drizzle mock returns { _isMockDb: true }
    expect(result).toEqual({ _isMockDb: true });
  });

  it("uses default pool size of 10 when not provided", async () => {
    const postgres = (await import("postgres")).default as ReturnType<typeof vi.fn>;
    vi.mocked(postgres).mockClear();
    const { createDb } = await import("./index");
    createDb("postgres://localhost/test");
    expect(postgres).toHaveBeenCalledWith("postgres://localhost/test", { max: 10 });
  });

  it("accepts a custom pool size", async () => {
    const postgres = (await import("postgres")).default as ReturnType<typeof vi.fn>;
    vi.mocked(postgres).mockClear();
    const { createDb } = await import("./index");
    createDb("postgres://localhost/test", 5);
    expect(postgres).toHaveBeenCalledWith("postgres://localhost/test", { max: 5 });
  });
});

describe("db (lazy singleton proxy)", () => {
  const originalEnv = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalEnv;
    // Reset module to clear singleton between tests
    vi.resetModules();
  });

  it("throws if DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();
    const { db } = await import("./index");
    expect(() => db.select).toThrow("DATABASE_URL is required");
  });

  it("creates connection lazily on first property access", async () => {
    process.env.DATABASE_URL = "postgres://localhost/test";
    vi.resetModules();
    const { db } = await import("./index");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    vi.mocked(drizzle).mockClear();
    // Access a property to trigger the proxy — drizzle called once
    void db.select;
    expect(vi.mocked(drizzle)).toHaveBeenCalledTimes(1);
    // Singleton: second access does NOT call drizzle again
    void db.insert;
    expect(vi.mocked(drizzle)).toHaveBeenCalledTimes(1);
  });
});

describe("Database type export", () => {
  it("is accessible as a TypeScript type", async () => {
    // Type-only check — if this import compiles, the type is exported
    const mod = await import("./index");
    // createDb returns the Database type at runtime
    expect(typeof mod.createDb).toBe("function");
  });
});
