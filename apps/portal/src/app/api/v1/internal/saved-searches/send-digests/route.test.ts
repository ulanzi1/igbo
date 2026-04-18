// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/db/queries/portal-saved-searches", () => ({
  getSavedSearchesForAlerts: vi.fn(),
  batchUpdateLastAlertedAt: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-job-search", () => ({
  findNewPostingsForAlert: vi.fn(),
}));
vi.mock("@igbo/db/queries/auth-queries", () => ({
  findUserById: vi.fn(),
}));
vi.mock("@/services/email-service", () => ({
  enqueueEmailJob: vi.fn(),
}));
vi.mock("@/lib/api-middleware", () => ({
  withApiHandler: vi.fn((handler: (req: Request) => Promise<Response>) => handler),
}));
vi.mock("@/lib/api-error", () => ({
  ApiError: class ApiError {
    status: number;
    title: string;
    constructor({ title, status }: { title: string; status: number }) {
      this.title = title;
      this.status = status;
    }
    toProblemDetails() {
      return { title: this.title, status: this.status };
    }
  },
}));
vi.mock("@/lib/api-response", () => ({
  successResponse: vi.fn((data: unknown) => Response.json({ data }, { status: 200 })),
}));
vi.mock("@/lib/internal-auth", () => ({
  requireInternalAuth: vi.fn(),
}));

import {
  getSavedSearchesForAlerts,
  batchUpdateLastAlertedAt,
} from "@igbo/db/queries/portal-saved-searches";
import { findNewPostingsForAlert } from "@igbo/db/queries/portal-job-search";
import { findUserById } from "@igbo/db/queries/auth-queries";
import { enqueueEmailJob } from "@/services/email-service";
import { requireInternalAuth } from "@/lib/internal-auth";
import { POST } from "./route";

const BASE_URL = "http://localhost/api/v1/internal/saved-searches/send-digests";

function makeRequest(authHeader?: string) {
  return new Request(BASE_URL, {
    method: "POST",
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

const SAVED_SEARCH_1 = {
  id: "ss-1",
  userId: "user-1",
  name: "Lagos Engineers",
  searchParamsJson: { query: "engineer", filters: {} },
  alertFrequency: "daily" as const,
  lastAlertedAt: new Date("2026-04-10T00:00:00Z"),
  createdAt: new Date("2026-04-01T00:00:00Z"),
  updatedAt: new Date("2026-04-10T00:00:00Z"),
};

const SAVED_SEARCH_2 = {
  id: "ss-2",
  userId: "user-1",
  name: "Remote Finance",
  searchParamsJson: { filters: { remote: true } },
  alertFrequency: "instant" as const,
  lastAlertedAt: null,
  createdAt: new Date("2026-04-01T00:00:00Z"),
  updatedAt: new Date("2026-04-01T00:00:00Z"),
};

const SAVED_SEARCH_3 = {
  id: "ss-3",
  userId: "user-2",
  name: "All Jobs",
  searchParamsJson: {},
  alertFrequency: "daily" as const,
  lastAlertedAt: null,
  createdAt: new Date("2026-04-01T00:00:00Z"),
  updatedAt: new Date("2026-04-01T00:00:00Z"),
};

const USER_1 = {
  id: "user-1",
  email: "ada@example.com",
  name: "Ada Obi",
  languagePreference: "en" as const,
};

const USER_2 = {
  id: "user-2",
  email: "chidi@example.com",
  name: "Chidi Okeke",
  languagePreference: "ig" as const,
};

const NEW_JOB = {
  id: "job-1",
  title: "Senior Engineer",
  companyName: "Igbo Tech",
  location: "Lagos",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(batchUpdateLastAlertedAt).mockResolvedValue(undefined);
  vi.mocked(enqueueEmailJob).mockImplementation(() => undefined);
  vi.mocked(requireInternalAuth).mockImplementation(() => undefined);
});

describe("POST /api/v1/internal/saved-searches/send-digests", () => {
  it("returns processed=0, emailsSent=0 when no saved searches exist", async () => {
    vi.mocked(getSavedSearchesForAlerts).mockResolvedValue([]);
    const res = await POST(makeRequest("Bearer test-secret"));
    const body = (await res.json()) as {
      data: { processed: number; emailsSent: number; errors: number };
    };
    expect(res.status).toBe(200);
    expect(body.data.processed).toBe(0);
    expect(body.data.emailsSent).toBe(0);
  });

  it("sends no emails when no new matches found", async () => {
    vi.mocked(getSavedSearchesForAlerts).mockResolvedValue([SAVED_SEARCH_1]);
    vi.mocked(findUserById).mockResolvedValue(
      USER_1 as ReturnType<typeof findUserById> extends Promise<infer T> ? T : never,
    );
    vi.mocked(findNewPostingsForAlert).mockResolvedValue([]);

    const res = await POST(makeRequest("Bearer test-secret"));
    const body = (await res.json()) as { data: { emailsSent: number } };
    expect(body.data.emailsSent).toBe(0);
    expect(enqueueEmailJob).not.toHaveBeenCalled();
  });

  it("sends digest email when new matches found", async () => {
    vi.mocked(getSavedSearchesForAlerts).mockResolvedValue([SAVED_SEARCH_1]);
    vi.mocked(findUserById).mockResolvedValue(
      USER_1 as ReturnType<typeof findUserById> extends Promise<infer T> ? T : never,
    );
    vi.mocked(findNewPostingsForAlert).mockResolvedValue([NEW_JOB]);

    const res = await POST(makeRequest("Bearer test-secret"));
    const body = (await res.json()) as { data: { emailsSent: number } };
    expect(body.data.emailsSent).toBe(1);
    expect(enqueueEmailJob).toHaveBeenCalledWith(
      expect.stringContaining("digest-user-1"),
      expect.objectContaining({
        to: "ada@example.com",
        templateId: "saved-search-digest",
        data: expect.objectContaining({ seekerName: "Ada Obi" }),
      }),
    );
  });

  it("groups multiple searches for same user into single email", async () => {
    vi.mocked(getSavedSearchesForAlerts).mockResolvedValue([SAVED_SEARCH_1, SAVED_SEARCH_2]);
    vi.mocked(findUserById).mockResolvedValue(
      USER_1 as ReturnType<typeof findUserById> extends Promise<infer T> ? T : never,
    );
    vi.mocked(findNewPostingsForAlert).mockResolvedValue([NEW_JOB]);

    const res = await POST(makeRequest("Bearer test-secret"));
    const body = (await res.json()) as { data: { emailsSent: number } };
    expect(body.data.emailsSent).toBe(1); // One email for one user
    expect(enqueueEmailJob).toHaveBeenCalledTimes(1);
    const emailData = (enqueueEmailJob as ReturnType<typeof vi.fn>).mock.calls[0]![1] as {
      data: { searches: Array<{ name: string }> };
    };
    expect(emailData.data.searches).toHaveLength(2);
  });

  it("sends separate emails for different users", async () => {
    vi.mocked(getSavedSearchesForAlerts).mockResolvedValue([SAVED_SEARCH_1, SAVED_SEARCH_3]);
    vi.mocked(findUserById)
      .mockResolvedValueOnce(
        USER_1 as ReturnType<typeof findUserById> extends Promise<infer T> ? T : never,
      )
      .mockResolvedValueOnce(
        USER_2 as ReturnType<typeof findUserById> extends Promise<infer T> ? T : never,
      );
    vi.mocked(findNewPostingsForAlert).mockResolvedValue([NEW_JOB]);

    const res = await POST(makeRequest("Bearer test-secret"));
    const body = (await res.json()) as { data: { emailsSent: number } };
    expect(body.data.emailsSent).toBe(2);
    expect(enqueueEmailJob).toHaveBeenCalledTimes(2);
  });

  it("uses created_at as sinceTimestamp when lastAlertedAt is null", async () => {
    vi.mocked(getSavedSearchesForAlerts).mockResolvedValue([SAVED_SEARCH_2]);
    vi.mocked(findUserById).mockResolvedValue(
      USER_1 as ReturnType<typeof findUserById> extends Promise<infer T> ? T : never,
    );
    vi.mocked(findNewPostingsForAlert).mockResolvedValue([NEW_JOB]);

    await POST(makeRequest("Bearer test-secret"));

    expect(findNewPostingsForAlert).toHaveBeenCalledWith(
      expect.any(Object),
      SAVED_SEARCH_2.createdAt,
    );
  });

  it("updates last_alerted_at only for searches with new matches", async () => {
    vi.mocked(getSavedSearchesForAlerts).mockResolvedValue([SAVED_SEARCH_1]);
    vi.mocked(findUserById).mockResolvedValue(
      USER_1 as ReturnType<typeof findUserById> extends Promise<infer T> ? T : never,
    );
    vi.mocked(findNewPostingsForAlert).mockResolvedValue([NEW_JOB]);

    await POST(makeRequest("Bearer test-secret"));

    expect(batchUpdateLastAlertedAt).toHaveBeenCalledWith(["ss-1"], expect.any(Date));
  });

  it("does NOT advance watermark for searches with no new matches", async () => {
    vi.mocked(getSavedSearchesForAlerts).mockResolvedValue([SAVED_SEARCH_1]);
    vi.mocked(findUserById).mockResolvedValue(
      USER_1 as ReturnType<typeof findUserById> extends Promise<infer T> ? T : never,
    );
    vi.mocked(findNewPostingsForAlert).mockResolvedValue([]);

    await POST(makeRequest("Bearer test-secret"));

    expect(batchUpdateLastAlertedAt).not.toHaveBeenCalled();
  });

  it("returns 401 when requireInternalAuth throws", async () => {
    const { ApiError } = await import("@/lib/api-error");
    vi.mocked(requireInternalAuth).mockImplementation(() => {
      throw new ApiError({ title: "Unauthorized", status: 401 });
    });
    vi.mocked(getSavedSearchesForAlerts).mockResolvedValue([]);

    // withApiHandler is mocked to call handler directly, so we test at handler level
    // The route calls requireInternalAuth before any other logic
    await expect(POST(makeRequest())).rejects.toThrow();
  });

  it("continues processing other users when one user's batch fails", async () => {
    vi.mocked(getSavedSearchesForAlerts).mockResolvedValue([SAVED_SEARCH_1, SAVED_SEARCH_3]);
    vi.mocked(findUserById)
      .mockRejectedValueOnce(new Error("DB timeout"))
      .mockResolvedValueOnce(
        USER_2 as ReturnType<typeof findUserById> extends Promise<infer T> ? T : never,
      );
    vi.mocked(findNewPostingsForAlert).mockResolvedValue([NEW_JOB]);

    const res = await POST(makeRequest("Bearer test-secret"));
    const body = (await res.json()) as { data: { emailsSent: number; errors: number } };
    expect(body.data.errors).toBe(1);
    expect(body.data.emailsSent).toBe(1);
  });
});

describe("send-digests route configuration", () => {
  it("is registered with skipCsrf: true", async () => {
    vi.resetModules();
    const { withApiHandler } = await import("@/lib/api-middleware");
    await import("./route");
    expect(withApiHandler).toHaveBeenCalledWith(expect.any(Function), { skipCsrf: true });
  });
});
