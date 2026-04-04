// @vitest-environment node
/**
 * Reference test for @igbo/auth tests.
 * Demonstrates: server-only bypass, ./config mock (auth injection pattern),
 * mockAuth function for per-test session control.
 * Copy and rename to start a new auth test.
 * IMPORTANT: This file must stay at the src/ root level — the ./config
 * relative mock path breaks if moved to a subdirectory.
 * Not for component/UI tests — those use jsdom.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockAuth = vi.fn();

vi.mock("./config", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("example: your feature under test", () => {
  it("demonstrates authenticated session mock", async () => {
    const session = { user: { id: "user-1", role: "MEMBER" } };
    mockAuth.mockResolvedValue(session);

    // Replace with: const result = await yourFunction();
    const result = await mockAuth();

    expect(result).toEqual(session);
  });

  it("demonstrates unauthenticated session mock", async () => {
    mockAuth.mockResolvedValue(null);

    // Replace with: const result = await yourFunction();
    const result = await mockAuth();

    expect(result).toBeNull();
  });
});
