// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { auth } from "@igbo/auth";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { requireCompanyProfile } from "./require-company-profile";

const mockProfile = {
  id: "company-uuid",
  ownerUserId: "user-123",
  name: "Acme Corp",
  logoUrl: null,
  description: null,
  industry: null,
  companySize: null,
  cultureInfo: null,
  trustBadge: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireCompanyProfile", () => {
  it("returns profile when employer has a company profile", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-123", activePortalRole: "EMPLOYER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockProfile);

    const result = await requireCompanyProfile("en");
    expect(result).toEqual(mockProfile);
  });

  it("redirects when employer has no company profile", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-123", activePortalRole: "EMPLOYER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);

    await expect(requireCompanyProfile("en")).rejects.toThrow(
      "REDIRECT:/en/company-profile?onboarding=true",
    );
  });

  it("returns null for non-employer role", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-456", activePortalRole: "JOB_SEEKER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

    const result = await requireCompanyProfile("en");
    expect(result).toBeNull();
    expect(getCompanyByOwnerId).not.toHaveBeenCalled();
  });

  it("returns null for unauthenticated user", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await requireCompanyProfile("en");
    expect(result).toBeNull();
    expect(getCompanyByOwnerId).not.toHaveBeenCalled();
  });
});
