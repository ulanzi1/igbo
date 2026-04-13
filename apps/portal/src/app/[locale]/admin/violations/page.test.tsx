// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/services/admin-review-service", () => ({
  getViolationsQueue: vi.fn(),
}));
vi.mock("@/components/domain/violations-table", () => ({
  ViolationsTable: () => null,
}));

import { auth } from "@igbo/auth";
import { redirect } from "next/navigation";
import { getViolationsQueue } from "@/services/admin-review-service";
import ViolationsPage from "./page";

function makeParams(locale = "en") {
  return Promise.resolve({ locale });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
  vi.mocked(getViolationsQueue).mockResolvedValue({ items: [], total: 0 });
});

describe("ViolationsPage", () => {
  it("renders for JOB_ADMIN", async () => {
    const result = await ViolationsPage({ params: makeParams() });

    expect(redirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("redirects non-admin (EMPLOYER) to home", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "emp-1", activePortalRole: "EMPLOYER" },
    } as never);

    await ViolationsPage({ params: makeParams("en") });

    expect(redirect).toHaveBeenCalledWith("/en");
  });

  it("redirects unauthenticated user", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    await ViolationsPage({ params: makeParams("en") });

    expect(redirect).toHaveBeenCalledWith("/en");
  });

  it("calls getViolationsQueue with limit 100", async () => {
    await ViolationsPage({ params: makeParams() });

    expect(getViolationsQueue).toHaveBeenCalledWith({ limit: 100, offset: 0 });
  });
});
