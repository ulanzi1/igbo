// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/server/auth/config", () => ({ auth: vi.fn() }));
vi.mock("@/services/onboarding-service", () => ({ completeTour: vi.fn() }));

import { completeTourAction } from "./complete-tour";
import { auth } from "@/server/auth/config";
import { completeTour } from "@/services/onboarding-service";

const mockAuth = vi.mocked(auth);
const mockCompleteTour = vi.mocked(completeTour);
const SESSION = { user: { id: "user-1" } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("completeTourAction", () => {
  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const result = await completeTourAction({ skipped: false });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });

  it("calls completeTour with skipped:false and returns success", async () => {
    mockAuth.mockResolvedValue(SESSION as never);
    mockCompleteTour.mockResolvedValue(undefined);
    const result = await completeTourAction({ skipped: false });
    expect(result.success).toBe(true);
    expect(mockCompleteTour).toHaveBeenCalledWith("user-1", { skipped: false });
  });

  it("calls completeTour with skipped:true when tour is skipped", async () => {
    mockAuth.mockResolvedValue(SESSION as never);
    mockCompleteTour.mockResolvedValue(undefined);
    const result = await completeTourAction({ skipped: true });
    expect(result.success).toBe(true);
    expect(mockCompleteTour).toHaveBeenCalledWith("user-1", { skipped: true });
  });

  it("returns error when service throws", async () => {
    mockAuth.mockResolvedValue(SESSION as never);
    mockCompleteTour.mockRejectedValue(new Error("fail"));
    const result = await completeTourAction({ skipped: false });
    expect(result.success).toBe(false);
  });
});
