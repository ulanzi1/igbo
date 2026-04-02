// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/server/auth/config", () => ({ auth: vi.fn() }));
vi.mock("@/services/onboarding-service", () => ({ acknowledgeGuidelines: vi.fn() }));

import { acknowledgeGuidelinesAction } from "./acknowledge-guidelines";
import { auth } from "@/server/auth/config";
import { acknowledgeGuidelines } from "@/services/onboarding-service";

const mockAuth = vi.mocked(auth);
const mockAcknowledge = vi.mocked(acknowledgeGuidelines);
const SESSION = { user: { id: "user-1" } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("acknowledgeGuidelinesAction", () => {
  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const result = await acknowledgeGuidelinesAction();
    expect(result.success).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });

  it("calls acknowledgeGuidelines and returns success", async () => {
    mockAuth.mockResolvedValue(SESSION as never);
    mockAcknowledge.mockResolvedValue(undefined);
    const result = await acknowledgeGuidelinesAction();
    expect(result.success).toBe(true);
    expect(mockAcknowledge).toHaveBeenCalledWith("user-1");
  });

  it("returns error when service throws", async () => {
    mockAuth.mockResolvedValue(SESSION as never);
    mockAcknowledge.mockRejectedValue(new Error("fail"));
    const result = await acknowledgeGuidelinesAction();
    expect(result.success).toBe(false);
  });
});
