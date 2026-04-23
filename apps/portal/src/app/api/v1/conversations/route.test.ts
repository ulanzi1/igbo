// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@/services/conversation-service", () => ({
  listUserConversations: vi.fn(),
}));

import { auth } from "@igbo/auth";
import * as conversationService from "@/services/conversation-service";
import { GET } from "./route";

const CONV_ID = "00000000-0000-4000-8000-000000000001";

const employerSession = {
  user: { id: "employer-1", activePortalRole: "EMPLOYER" },
};

const mockConversation = {
  id: CONV_ID,
  type: "direct",
  context: "portal",
  applicationId: "app-1",
};

function makeGetRequest(params: Record<string, string> = {}): Request {
  const url = new URL("https://jobs.igbo.com/api/v1/conversations");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString(), {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
  vi.mocked(conversationService.listUserConversations).mockResolvedValue({
    conversations: [mockConversation] as never,
    hasMore: false,
  });
});

describe("GET /api/v1/conversations", () => {
  it("returns 200 with conversation list", async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.conversations).toHaveLength(1);
  });

  it("returns 401 without auth", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("passes cursor and limit params to listUserConversations", async () => {
    await GET(makeGetRequest({ cursor: "abc", limit: "15" }));
    expect(conversationService.listUserConversations).toHaveBeenCalledWith(
      "employer-1",
      expect.objectContaining({ cursor: "abc", limit: 15 }),
    );
  });

  it("returns 400 for invalid limit (NaN)", async () => {
    const res = await GET(makeGetRequest({ limit: "abc" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for negative limit", async () => {
    const res = await GET(makeGetRequest({ limit: "-1" }));
    expect(res.status).toBe(400);
  });
});
