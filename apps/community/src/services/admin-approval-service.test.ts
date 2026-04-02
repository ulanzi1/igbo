// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdminSession: vi.fn(),
}));

vi.mock("@igbo/db/queries/admin-approvals", () => ({
  listApplications: vi.fn(),
  getApplicationById: vi.fn(),
  updateApplicationStatus: vi.fn(),
}));

vi.mock("@/services/audit-logger", () => ({
  logAdminAction: vi.fn(),
}));

vi.mock("@/services/email-service", () => ({
  enqueueEmailJob: vi.fn(),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock("@/services/auth-service", () => ({
  generatePasswordSetToken: vi.fn(),
}));

vi.mock("@/lib/sanitize", () => ({
  sanitizeHtml: (html: string) => html,
}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_APP_URL: "https://app.example.com",
    EMAIL_FROM_NAME: "OBIGBO",
    EMAIL_SUPPORT_ADDRESS: "support@example.com",
  },
}));

vi.mock("@igbo/db", () => ({ db: {} }));
vi.mock("@igbo/db/schema/auth-users", () => ({ authUsers: {} }));

import {
  getApplicationsList,
  approveApplication,
  requestMoreInfo,
  rejectApplication,
  undoAction,
} from "./admin-approval-service";

import { requireAdminSession } from "@/lib/admin-auth";
import {
  listApplications,
  getApplicationById,
  updateApplicationStatus,
} from "@igbo/db/queries/admin-approvals";
import { logAdminAction } from "@/services/audit-logger";
import { enqueueEmailJob } from "@/services/email-service";
import { eventBus } from "@/services/event-bus";
import { generatePasswordSetToken } from "@/services/auth-service";
import { ApiError } from "@/lib/api-error";

const mockRequireAdmin = vi.mocked(requireAdminSession);
const mockListApps = vi.mocked(listApplications);
const mockGetApp = vi.mocked(getApplicationById);
const mockUpdateStatus = vi.mocked(updateApplicationStatus);
const mockLogAction = vi.mocked(logAdminAction);
const mockEnqueueEmail = vi.mocked(enqueueEmailJob);
const mockEmit = vi.mocked(eventBus.emit);
const mockGenerateToken = vi.mocked(generatePasswordSetToken);

const ADMIN_ID = "admin-1";
const USER_ID = "user-1";

const fakeRequest = new Request("https://app.example.com/api/v1/admin/applications", {
  headers: { "CF-Connecting-IP": "1.2.3.4" },
});

const pendingApp = {
  id: USER_ID,
  email: "user@example.com",
  name: "Test User",
  accountStatus: "PENDING_APPROVAL",
} as never;

const updatedApp = {
  id: USER_ID,
  email: "user@example.com",
  name: "Test User",
  accountStatus: "APPROVED",
} as never;

beforeEach(() => {
  vi.resetAllMocks();
  mockRequireAdmin.mockResolvedValue({ adminId: ADMIN_ID } as never);
});

describe("getApplicationsList", () => {
  it("requires admin session and delegates to listApplications", async () => {
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockListApps.mockResolvedValue(expected as never);

    const result = await getApplicationsList(fakeRequest, { page: 2 });

    expect(mockRequireAdmin).toHaveBeenCalledWith(fakeRequest);
    expect(mockListApps).toHaveBeenCalledWith({ page: 2 });
    expect(result).toEqual(expected);
  });
});

describe("approveApplication", () => {
  it("approves a pending application", async () => {
    mockGetApp.mockResolvedValue(pendingApp);
    mockUpdateStatus.mockResolvedValue(updatedApp);
    mockGenerateToken.mockResolvedValue("token-abc");

    await approveApplication(fakeRequest, USER_ID);

    expect(mockUpdateStatus).toHaveBeenCalledWith(USER_ID, "APPROVED");
    expect(mockEmit).toHaveBeenCalledWith(
      "member.approved",
      expect.objectContaining({ userId: USER_ID, approvedBy: ADMIN_ID }),
    );
    expect(mockEnqueueEmail).toHaveBeenCalledWith(
      expect.stringContaining(USER_ID),
      expect.objectContaining({ templateId: "welcome-approved" }),
    );
    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "APPROVE_APPLICATION", targetUserId: USER_ID }),
    );
  });

  it("throws 404 when application not found", async () => {
    mockGetApp.mockResolvedValue(null);

    await expect(approveApplication(fakeRequest, USER_ID)).rejects.toThrow(ApiError);
    await expect(approveApplication(fakeRequest, USER_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 409 when application is not PENDING_APPROVAL", async () => {
    mockGetApp.mockResolvedValue({ ...pendingApp, accountStatus: "APPROVED" } as never);

    await expect(approveApplication(fakeRequest, USER_ID)).rejects.toThrow(ApiError);
  });

  it("throws 500 when updateApplicationStatus returns null", async () => {
    mockGetApp.mockResolvedValue(pendingApp);
    mockUpdateStatus.mockResolvedValue(null);

    await expect(approveApplication(fakeRequest, USER_ID)).rejects.toMatchObject({ status: 500 });
  });
});

describe("requestMoreInfo", () => {
  it("requests more info for a pending application", async () => {
    mockGetApp.mockResolvedValue(pendingApp);
    mockUpdateStatus.mockResolvedValue(updatedApp);

    await requestMoreInfo(fakeRequest, USER_ID, "Please clarify your connection");

    expect(mockUpdateStatus).toHaveBeenCalledWith(
      USER_ID,
      "INFO_REQUESTED",
      "Please clarify your connection",
    );
    expect(mockEmit).toHaveBeenCalledWith(
      "member.info_requested",
      expect.objectContaining({ userId: USER_ID }),
    );
    expect(mockEnqueueEmail).toHaveBeenCalledWith(
      expect.stringContaining(USER_ID),
      expect.objectContaining({ templateId: "request-info" }),
    );
  });

  it("throws 404 when application not found", async () => {
    mockGetApp.mockResolvedValue(null);

    await expect(requestMoreInfo(fakeRequest, USER_ID, "msg")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("rejectApplication", () => {
  it("rejects a pending application", async () => {
    mockGetApp.mockResolvedValue(pendingApp);
    mockUpdateStatus.mockResolvedValue(updatedApp);

    await rejectApplication(fakeRequest, USER_ID);

    expect(mockUpdateStatus).toHaveBeenCalledWith(USER_ID, "REJECTED");
    expect(mockEmit).toHaveBeenCalledWith(
      "member.rejected",
      expect.objectContaining({ userId: USER_ID }),
    );
    expect(mockEnqueueEmail).toHaveBeenCalledWith(
      expect.stringContaining(USER_ID),
      expect.objectContaining({ templateId: "rejection-notice" }),
    );
    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "REJECT_APPLICATION" }),
    );
  });

  it("throws 409 when not in PENDING_APPROVAL status", async () => {
    mockGetApp.mockResolvedValue({ ...pendingApp, accountStatus: "REJECTED" } as never);

    await expect(rejectApplication(fakeRequest, USER_ID)).rejects.toThrow(ApiError);
  });
});

describe("undoAction", () => {
  it("reverts status to PENDING_APPROVAL", async () => {
    const approvedApp = { ...pendingApp, accountStatus: "APPROVED" } as never;
    mockGetApp.mockResolvedValue(approvedApp);
    mockUpdateStatus.mockResolvedValue(pendingApp);

    await undoAction(fakeRequest, USER_ID, "APPROVED");

    expect(mockUpdateStatus).toHaveBeenCalledWith(USER_ID, "PENDING_APPROVAL", undefined);
    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UNDO_ACTION",
        details: expect.objectContaining({ undoneStatus: "APPROVED" }),
      }),
    );
  });

  it("throws 400 for invalid undoFromStatus", async () => {
    await expect(undoAction(fakeRequest, USER_ID, "INVALID")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("throws 404 when application not found", async () => {
    mockGetApp.mockResolvedValue(null);

    await expect(undoAction(fakeRequest, USER_ID, "APPROVED")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 409 when current status does not match undoFromStatus", async () => {
    mockGetApp.mockResolvedValue({ ...pendingApp, accountStatus: "REJECTED" } as never);

    await expect(undoAction(fakeRequest, USER_ID, "APPROVED")).rejects.toThrow(ApiError);
  });
});
