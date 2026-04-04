// @vitest-environment node
/**
 * Reference test for portal server-side tests.
 * Demonstrates: @vitest-environment node override, @igbo/auth mock,
 * @igbo/config/env import verification.
 * Copy and rename to start a new portal test.
 * Not for component/UI tests — those use the default jsdom environment
 * without the directive.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("example: your feature under test", () => {
  it("demonstrates @igbo/auth mock with session", async () => {
    const { auth } = await import("@igbo/auth");
    const session = {
      user: { id: "user-1", role: "MEMBER" },
      expires: new Date(Date.now() + 86400000).toISOString(),
    };
    vi.mocked(auth).mockResolvedValue(session);

    const result = await auth();

    expect(result).toEqual(session);
  });

  it("verifies @igbo/config subpath aliases resolve (regex proof)", async () => {
    // This import was NOT in the old enumerated alias list — proves regex works
    const notifications = await import("@igbo/config/notifications");

    expect(notifications).toBeDefined();
  });
});
