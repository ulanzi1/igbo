// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock("@igbo/auth", () => ({
  handlers: {
    GET: (...args: unknown[]) => mockGet(...args),
    POST: (...args: unknown[]) => mockPost(...args),
  },
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  initAuthRedis: vi.fn(),
}));

import { GET, POST } from "./route";

describe("Portal auth route handler", () => {
  it("exports GET handler from @igbo/auth handlers", () => {
    expect(GET).toBeDefined();
    expect(typeof GET).toBe("function");
  });

  it("exports POST handler from @igbo/auth handlers", () => {
    expect(POST).toBeDefined();
    expect(typeof POST).toBe("function");
  });

  it("GET delegates to @igbo/auth handlers.GET", async () => {
    const mockRequest = new Request("http://localhost:3001/api/auth/session");
    const mockResponse = new Response(JSON.stringify({ user: null }), { status: 200 });
    mockGet.mockResolvedValue(mockResponse);

    const result = await GET(mockRequest);
    expect(mockGet).toHaveBeenCalledWith(mockRequest);
    expect(result).toBe(mockResponse);
  });

  it("POST delegates to @igbo/auth handlers.POST", async () => {
    const mockRequest = new Request("http://localhost:3001/api/auth/signin", {
      method: "POST",
      body: JSON.stringify({ challengeToken: "test-token" }),
    });
    const mockResponse = new Response(JSON.stringify({ url: "http://localhost:3001" }), {
      status: 200,
    });
    mockPost.mockResolvedValue(mockResponse);

    const result = await POST(mockRequest);
    expect(mockPost).toHaveBeenCalledWith(mockRequest);
    expect(result).toBe(mockResponse);
  });
});
