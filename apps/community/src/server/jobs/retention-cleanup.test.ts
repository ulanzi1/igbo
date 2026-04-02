// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { mockRegisterJob, handlerRef } = vi.hoisted(() => ({
  mockRegisterJob: vi.fn(),
  handlerRef: { current: null as (() => Promise<void>) | null },
}));

const mockAnonymizeAccount = vi.fn();
const mockFindAccountsPendingAnonymization = vi.fn();

vi.mock("@/services/gdpr-service", () => ({
  anonymizeAccount: (...args: unknown[]) => mockAnonymizeAccount(...args),
  findAccountsPendingAnonymization: (...args: unknown[]) =>
    mockFindAccountsPendingAnonymization(...args),
}));

vi.mock("@/server/jobs/job-runner", () => ({
  registerJob: (name: string, handler: () => Promise<void>) => {
    mockRegisterJob(name, handler);
    handlerRef.current = handler;
  },
}));

// Import after mocks — side-effect: calls registerJob
import "./retention-cleanup";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("retention-cleanup job", () => {
  it("registers the job handler at module load time", () => {
    expect(handlerRef.current).toBeTypeOf("function");
  });

  it("calls anonymizeAccount for each account past the grace period", async () => {
    const accounts = [
      { id: "user-1", accountStatus: "PENDING_DELETION" },
      { id: "user-2", accountStatus: "PENDING_DELETION" },
    ];
    mockFindAccountsPendingAnonymization.mockResolvedValue(accounts);
    mockAnonymizeAccount.mockResolvedValue(undefined);

    await handlerRef.current!();

    expect(mockFindAccountsPendingAnonymization).toHaveBeenCalledOnce();
    expect(mockAnonymizeAccount).toHaveBeenCalledTimes(2);
    expect(mockAnonymizeAccount).toHaveBeenCalledWith("user-1");
    expect(mockAnonymizeAccount).toHaveBeenCalledWith("user-2");
  });

  it("does nothing when no accounts are pending anonymization", async () => {
    mockFindAccountsPendingAnonymization.mockResolvedValue([]);

    await handlerRef.current!();

    expect(mockAnonymizeAccount).not.toHaveBeenCalled();
  });
});
