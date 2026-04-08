// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { auth } from "@igbo/auth";
import { redirect } from "next/navigation";
import AdminLayout from "./layout";

const mockChildren = <div>Admin Content</div>;

function makeParams(locale = "en") {
  return Promise.resolve({ locale });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminLayout", () => {
  it("renders children for JOB_ADMIN session", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
    } as never);

    const result = await AdminLayout({ children: mockChildren, params: makeParams() });

    expect(redirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("redirects EMPLOYER to home", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "emp-1", activePortalRole: "EMPLOYER" },
    } as never);

    await AdminLayout({ children: mockChildren, params: makeParams("en") });

    expect(redirect).toHaveBeenCalledWith("/en");
  });

  it("redirects JOB_SEEKER to home", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "seeker-1", activePortalRole: "JOB_SEEKER" },
    } as never);

    await AdminLayout({ children: mockChildren, params: makeParams("en") });

    expect(redirect).toHaveBeenCalledWith("/en");
  });
});
