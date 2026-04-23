// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "@/lib/api-error";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@/services/conversation-service", () => ({
  getConversationStatus: vi.fn(),
}));

import { auth } from "@igbo/auth";
import * as conversationService from "@/services/conversation-service";
import { GET } from "./route";

const APP_ID = "00000000-0000-4000-8000-000000000001";

const employerSession = {
  user: { id: "employer-1", activePortalRole: "EMPLOYER" },
};

function makeGetRequest(appId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/conversations/${appId}/status`, {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    employerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
  vi.mocked(conversationService.getConversationStatus).mockResolvedValue({
    exists: true,
    readOnly: false,
  });
});

describe("GET /api/v1/conversations/[applicationId]/status", () => {
  it("returns 200 with status", async () => {
    const res = await GET(makeGetRequest(APP_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ exists: true, readOnly: false });
  });

  it("returns 401 without auth", async () => {
    vi.mocked(auth).mockResolvedValue(null as unknown);
    const res = await GET(makeGetRequest(APP_ID));
    expect(res.status).toBe(401);
  });

  it("passes userId to getConversationStatus", async () => {
    await GET(makeGetRequest(APP_ID));
    expect(conversationService.getConversationStatus).toHaveBeenCalledWith(APP_ID, "employer-1");
  });

  it("returns 404 for non-participant (service throws 404)", async () => {
    vi.mocked(conversationService.getConversationStatus).mockRejectedValue(
      new ApiError({ title: "Not Found", status: 404 }),
    );
    const res = await GET(makeGetRequest(APP_ID));
    expect(res.status).toBe(404);
  });

  it("returns 400 for non-UUID applicationId", async () => {
    const res = await GET(makeGetRequest("not-a-uuid"));
    expect(res.status).toBe(400);
  });
});
