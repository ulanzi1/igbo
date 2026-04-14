// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@igbo/db/queries/portal-posting-reports", () => ({
  getReportsForPosting: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingById: vi.fn(),
}));
vi.mock("@/components/domain/report-investigation-detail", () => ({
  ReportInvestigationDetail: () => null,
}));

import { auth } from "@igbo/auth";
import { redirect, notFound } from "next/navigation";
import { getReportsForPosting } from "@igbo/db/queries/portal-posting-reports";
import { getJobPostingById } from "@igbo/db/queries/portal-job-postings";
import AdminReportDetailPage from "./page";

function makeParams(locale = "en", postingId = "posting-1") {
  return Promise.resolve({ locale, postingId });
}

const MOCK_POSTING = {
  id: "posting-1",
  title: "Software Engineer",
  status: "active",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
  vi.mocked(getJobPostingById).mockResolvedValue(MOCK_POSTING as never);
  vi.mocked(getReportsForPosting).mockResolvedValue([]);
});

describe("AdminReportDetailPage", () => {
  it("renders for JOB_ADMIN", async () => {
    const result = await AdminReportDetailPage({ params: makeParams() });

    expect(redirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("redirects non-admin to home", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "emp-1", activePortalRole: "EMPLOYER" },
    } as never);

    await AdminReportDetailPage({ params: makeParams("en") });

    expect(redirect).toHaveBeenCalledWith("/en");
  });

  it("redirects unauthenticated user", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    await AdminReportDetailPage({ params: makeParams("en") });

    expect(redirect).toHaveBeenCalledWith("/en");
  });

  it("calls notFound when posting does not exist", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(null as never);

    await expect(AdminReportDetailPage({ params: makeParams() })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("fetches reports for the postingId", async () => {
    await AdminReportDetailPage({ params: makeParams("en", "posting-42") });

    expect(getReportsForPosting).toHaveBeenCalledWith("posting-42");
  });
});
