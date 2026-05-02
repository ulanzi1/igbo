// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/db", () => ({
  db: { transaction: vi.fn() },
}));
vi.mock("@igbo/db/schema/portal-applications", () => ({
  portalApplications: { id: "id" },
}));
vi.mock("@igbo/db/queries/portal-applications", () => ({
  getApplicationWithCurrentStatus: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-application-views", () => ({
  recordApplicationViewRow: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-outbox", () => ({
  insertOutboxEvent: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
}));
vi.mock("@/lib/api-error", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor({ title, status }: { title: string; status: number }) {
      super(title);
      this.status = status;
    }
  },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import { db } from "@igbo/db";
import { getApplicationWithCurrentStatus } from "@igbo/db/queries/portal-applications";
import { recordApplicationViewRow } from "@igbo/db/queries/portal-application-views";
import { insertOutboxEvent } from "@igbo/db/queries/portal-outbox";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";

const APP_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const EMPLOYER_ID = "employer-1";
const COMPANY_ID = "cp-1";
const JOB_ID = "job-1";
const SEEKER_ID = "seeker-1";

const mockApp = {
  id: APP_ID,
  status: "submitted" as const,
  jobId: JOB_ID,
  seekerUserId: SEEKER_ID,
  companyId: COMPANY_ID,
};

const mockCompany = { id: COMPANY_ID, ownerUserId: EMPLOYER_ID };

function setupTransactionMock(isFirstView: boolean) {
  const tx = {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }),
    execute: vi.fn().mockResolvedValue({ count: isFirstView ? 1 : 0 }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(db.transaction).mockImplementation(async (cb: any) => cb(tx));
  vi.mocked(recordApplicationViewRow).mockResolvedValue({ isFirstView });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(insertOutboxEvent).mockResolvedValue({} as any);
  return tx;
}

describe("application-view-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(mockApp);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockCompany as any);
  });

  describe("recordApplicationView", () => {
    it("returns isFirstView=true and creates all 3 records on first view", async () => {
      const tx = setupTransactionMock(true);
      const { recordApplicationView } = await import("./application-view-service");
      const result = await recordApplicationView(APP_ID, EMPLOYER_ID);
      expect(result.isFirstView).toBe(true);
      expect(tx.update).toHaveBeenCalledOnce();
      expect(insertOutboxEvent).toHaveBeenCalledOnce();
      expect(insertOutboxEvent).toHaveBeenCalledWith(
        expect.anything(),
        "portal.application.viewed",
        expect.objectContaining({
          applicationId: APP_ID,
          jobId: JOB_ID,
          seekerUserId: SEEKER_ID,
          employerUserId: EMPLOYER_ID,
        }),
      );
    });

    it("returns isFirstView=false and does NOT insert outbox event or update viewed_at on duplicate view", async () => {
      const tx = setupTransactionMock(false);
      const { recordApplicationView } = await import("./application-view-service");
      const result = await recordApplicationView(APP_ID, EMPLOYER_ID);
      expect(result.isFirstView).toBe(false);
      expect(insertOutboxEvent).not.toHaveBeenCalled();
      expect(tx.update).not.toHaveBeenCalled();
    });

    it("throws 404 when application not found", async () => {
      vi.mocked(getApplicationWithCurrentStatus).mockResolvedValue(null);
      const { recordApplicationView } = await import("./application-view-service");
      await expect(recordApplicationView(APP_ID, EMPLOYER_ID)).rejects.toMatchObject({
        status: 404,
      });
    });

    it("throws 403 when employer doesn't own the application's company", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(getCompanyByOwnerId).mockResolvedValue({ id: "different-company" } as any);
      const { recordApplicationView } = await import("./application-view-service");
      await expect(recordApplicationView(APP_ID, EMPLOYER_ID)).rejects.toMatchObject({
        status: 403,
      });
    });

    it("throws 403 when employer has no company", async () => {
      vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
      const { recordApplicationView } = await import("./application-view-service");
      await expect(recordApplicationView(APP_ID, EMPLOYER_ID)).rejects.toMatchObject({
        status: 403,
      });
    });

    it("outbox payload includes correct jobId and seekerUserId from application lookup", async () => {
      setupTransactionMock(true);
      const { recordApplicationView } = await import("./application-view-service");
      await recordApplicationView(APP_ID, EMPLOYER_ID);
      expect(insertOutboxEvent).toHaveBeenCalledWith(
        expect.anything(),
        "portal.application.viewed",
        expect.objectContaining({
          jobId: JOB_ID,
          seekerUserId: SEEKER_ID,
        }),
      );
    });

    it("outbox payload includes a timestamp string", async () => {
      setupTransactionMock(true);
      const { recordApplicationView } = await import("./application-view-service");
      await recordApplicationView(APP_ID, EMPLOYER_ID);
      const payload = vi.mocked(insertOutboxEvent).mock.calls[0]?.[2];
      expect(typeof payload?.timestamp).toBe("string");
    });
  });
});
