import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/flow/close-posting-modal", () => ({
  ClosePostingModal: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
  }) =>
    open ? (
      <div data-testid="close-modal">
        <button type="button" data-testid="close-modal-cancel" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
      </div>
    ) : null,
}));

vi.mock("@/components/flow/extend-posting-modal", () => ({
  ExtendPostingModal: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
  }) =>
    open ? (
      <div data-testid="extend-modal">
        <button type="button" data-testid="extend-modal-cancel" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
      </div>
    ) : null,
}));

import React from "react";
import { toast } from "sonner";
import { PostingStatusActions } from "./posting-status-actions";
import type { PortalJobStatus } from "@igbo/db/schema/portal-job-postings";

function renderActions(
  status: PortalJobStatus,
  onStatusChange?: () => void,
  expiresAt?: Date | string | null,
) {
  return render(
    <PostingStatusActions
      postingId="posting-uuid"
      status={status}
      locale="en"
      expiresAt={expiresAt}
      onStatusChange={onStatusChange}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({}),
  });
});

describe("PostingStatusActions", () => {
  describe("draft status", () => {
    it("shows Preview link, Edit link, and Submit for Review button", () => {
      renderActions("draft");
      expect(screen.getByTestId("preview-link")).toBeTruthy();
      expect(screen.getByTestId("edit-link")).toBeTruthy();
      expect(screen.getByTestId("submit-for-review-button")).toBeTruthy();
    });

    it("Preview link points to preview page", () => {
      renderActions("draft");
      const link = screen.getByTestId("preview-link") as HTMLAnchorElement;
      expect(link.href).toContain("/en/jobs/posting-uuid/preview");
    });

    it("Edit link points to edit page", () => {
      renderActions("draft");
      const link = screen.getByTestId("edit-link") as HTMLAnchorElement;
      expect(link.href).toContain("/en/jobs/posting-uuid/edit");
    });

    it("Submit for Review calls PATCH with pending_review", async () => {
      const user = userEvent.setup();
      renderActions("draft");
      await user.click(screen.getByTestId("submit-for-review-button"));
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/v1/jobs/posting-uuid/status",
          expect.objectContaining({
            method: "PATCH",
            body: expect.stringContaining('"targetStatus":"pending_review"'),
          }),
        );
      });
    });
  });

  describe("active status", () => {
    it("shows Edit link, Pause button, and Close Posting button", () => {
      renderActions("active");
      expect(screen.getByTestId("edit-link")).toBeTruthy();
      expect(screen.getByTestId("pause-button")).toBeTruthy();
      expect(screen.getByTestId("close-posting-button")).toBeTruthy();
    });

    it("Pause button calls PATCH with paused", async () => {
      const user = userEvent.setup();
      renderActions("active");
      await user.click(screen.getByTestId("pause-button"));
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/v1/jobs/posting-uuid/status",
          expect.objectContaining({
            method: "PATCH",
            body: expect.stringContaining('"targetStatus":"paused"'),
          }),
        );
      });
    });

    it("Close Posting button opens close modal", async () => {
      const user = userEvent.setup();
      renderActions("active");
      expect(screen.queryByTestId("close-modal")).toBeNull();
      await user.click(screen.getByTestId("close-posting-button"));
      expect(screen.getByTestId("close-modal")).toBeTruthy();
    });
  });

  describe("paused status", () => {
    it("shows Unpause button and Close Posting button", () => {
      renderActions("paused");
      expect(screen.getByTestId("unpause-button")).toBeTruthy();
      expect(screen.getByTestId("close-posting-button")).toBeTruthy();
    });

    it("Unpause button calls PATCH with active", async () => {
      const user = userEvent.setup();
      renderActions("paused");
      await user.click(screen.getByTestId("unpause-button"));
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/v1/jobs/posting-uuid/status",
          expect.objectContaining({
            method: "PATCH",
            body: expect.stringContaining('"targetStatus":"active"'),
          }),
        );
      });
    });
  });

  describe("pending_review status", () => {
    it("shows awaiting review text, no action buttons", () => {
      renderActions("pending_review");
      expect(screen.getByTestId("awaiting-review-text")).toBeTruthy();
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.queryByRole("link")).toBeNull();
    });
  });

  describe("rejected status", () => {
    it("shows Edit & Resubmit link", () => {
      renderActions("rejected");
      expect(screen.getByTestId("edit-resubmit-link")).toBeTruthy();
      const link = screen.getByTestId("edit-resubmit-link") as HTMLAnchorElement;
      expect(link.href).toContain("/en/jobs/posting-uuid/edit");
    });
  });

  describe("filled status", () => {
    it("shows disabled View Applications button", () => {
      renderActions("filled");
      const btn = screen.getByTestId("view-applications-disabled") as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  describe("expired status", () => {
    it("shows Extend, Edit & Renew, and Close buttons for expired posting", () => {
      renderActions("expired");
      expect(screen.getByTestId("extend-button")).toBeInTheDocument();
      expect(screen.getByTestId("edit-renew-link")).toBeInTheDocument();
      expect(screen.getByTestId("close-posting-button")).toBeInTheDocument();
    });

    it("Edit & Renew link points to edit page", () => {
      renderActions("expired");
      const link = screen.getByTestId("edit-renew-link") as HTMLAnchorElement;
      expect(link.href).toContain("/en/jobs/posting-uuid/edit");
    });

    it("Extend button opens extend modal", async () => {
      const user = userEvent.setup();
      renderActions("expired");
      expect(screen.queryByTestId("extend-modal")).toBeNull();
      await user.click(screen.getByTestId("extend-button"));
      expect(screen.getByTestId("extend-modal")).toBeInTheDocument();
    });

    it("Close button opens close modal", async () => {
      const user = userEvent.setup();
      renderActions("expired");
      expect(screen.queryByTestId("close-modal")).toBeNull();
      await user.click(screen.getByTestId("close-posting-button"));
      expect(screen.getByTestId("close-modal")).toBeInTheDocument();
    });
  });

  describe("expiring-soon badge", () => {
    it("shows expiring-soon badge when active and expiresAt is within 7 days", () => {
      const soonDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      renderActions("active", undefined, soonDate);
      expect(screen.getByTestId("expiring-soon-badge")).toBeInTheDocument();
    });

    it("does NOT show expiring-soon badge when active and expiresAt is more than 7 days away", () => {
      const farDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      renderActions("active", undefined, farDate);
      expect(screen.queryByTestId("expiring-soon-badge")).toBeNull();
    });

    it("does NOT show expiring-soon badge when status is draft (not active)", () => {
      const soonDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      renderActions("draft", undefined, soonDate);
      expect(screen.queryByTestId("expiring-soon-badge")).toBeNull();
    });

    it("does NOT show expiring-soon badge when expiresAt is null", () => {
      renderActions("active", undefined, null);
      expect(screen.queryByTestId("expiring-soon-badge")).toBeNull();
    });
  });

  describe("error handling", () => {
    it("shows generic error toast on API failure", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue({ ok: false, status: 500, json: vi.fn().mockResolvedValue({}) });
      const user = userEvent.setup();
      renderActions("draft");
      await user.click(screen.getByTestId("submit-for-review-button"));
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });

    it("calls onStatusChange after successful status change", async () => {
      const onStatusChange = vi.fn();
      const user = userEvent.setup();
      renderActions("draft", onStatusChange);
      await user.click(screen.getByTestId("submit-for-review-button"));
      await waitFor(() => {
        expect(onStatusChange).toHaveBeenCalled();
      });
    });
  });

  it("passes axe accessibility check for draft status", async () => {
    const { container } = renderActions("draft");
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
