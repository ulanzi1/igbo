// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockRequestMoreInfo = vi.fn();

vi.mock("@/services/admin-approval-service", () => ({
  requestMoreInfo: (...args: unknown[]) => mockRequestMoreInfo(...args),
}));

vi.mock("@igbo/db/queries/auth-queries", () => ({ findUserById: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: vi.fn() }));
vi.mock("@/services/permissions", () => ({ isAdmin: vi.fn() }));
vi.mock("@/services/event-bus", () => ({ eventBus: { emit: vi.fn() } }));
vi.mock("@/services/email-service", () => ({ enqueueEmailJob: vi.fn() }));
vi.mock("@/services/audit-logger", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { POST } from "./route";

const ADMIN_ID = "admin-uuid-1";
const APP_ID = "application-uuid-1";

function makePostRequest(body: Record<string, unknown> = { message: "Please provide more info." }) {
  return new Request(`https://example.com/api/v1/admin/applications/${APP_ID}/request-info`, {
    method: "POST",
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
      "Content-Type": "application/json",
      "X-Admin-Id": ADMIN_ID,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequestMoreInfo.mockResolvedValue(undefined);
});

describe("POST /api/v1/admin/applications/[id]/request-info", () => {
  it("returns 200 with a message on success", async () => {
    const req = makePostRequest();
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.message).toBe("Information requested");
  });

  it("calls requestMoreInfo with id from URL and message from body", async () => {
    const req = makePostRequest({ message: "Can you clarify your connection?" });
    await POST(req);
    expect(mockRequestMoreInfo).toHaveBeenCalledWith(
      expect.any(Request),
      APP_ID,
      "Can you clarify your connection?",
    );
  });

  it("returns 400 when message is missing", async () => {
    const req = makePostRequest({ message: "" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when message is not a string", async () => {
    const req = makePostRequest({ message: 42 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("persists and sanitizes admin_notes via service layer", async () => {
    const req = makePostRequest({ message: "<script>alert(1)</script>Hello" });
    await POST(req);
    // The sanitization happens in requestMoreInfo (mocked), so verify it was called
    expect(mockRequestMoreInfo).toHaveBeenCalledWith(
      expect.any(Request),
      APP_ID,
      "<script>alert(1)</script>Hello",
    );
    // Actual sanitization is tested in the service layer
  });
});
