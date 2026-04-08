import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { SeekerCvManager } from "./seeker-cv-manager";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: { children: React.ReactNode }) => (
    <span data-testid="badge" {...props}>
      {children}
    </span>
  ),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { toast } from "sonner";
import React from "react";

const mockCv = {
  id: "cv-uuid",
  seekerProfileId: "profile-uuid",
  fileUploadId: "upload-uuid",
  label: "Main CV",
  isDefault: true,
  createdAt: new Date(),
  file: {
    originalFilename: "resume.pdf",
    fileType: "application/pdf",
    fileSize: 1024,
    objectKey: "portal/cvs/user-1/abc.pdf",
    status: "processing" as const,
  },
};

const mockCv2 = {
  ...mockCv,
  id: "cv-uuid-2",
  label: "Technical CV",
  isDefault: false,
  file: { ...mockCv.file, originalFilename: "tech-cv.pdf" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SeekerCvManager", () => {
  it("renders empty state when no CVs", () => {
    render(<SeekerCvManager />);
    expect(screen.getByText("cvEmpty")).toBeTruthy();
  });

  it("renders list of CVs with labels", () => {
    render(<SeekerCvManager initialCvs={[mockCv, mockCv2]} />);
    expect(screen.getByText("Main CV")).toBeTruthy();
    expect(screen.getByText("Technical CV")).toBeTruthy();
  });

  it("shows default badge on default CV", () => {
    render(<SeekerCvManager initialCvs={[mockCv]} />);
    const defaultBadge = screen.getByTestId("default-badge");
    expect(defaultBadge.textContent).toContain("cvDefault");
  });

  it("shows set-default button only on non-default CVs", () => {
    render(<SeekerCvManager initialCvs={[mockCv, mockCv2]} />);
    const setDefaultBtns = screen.getAllByRole("button", { name: /cvSetDefault/i });
    expect(setDefaultBtns).toHaveLength(1);
  });

  it("shows delete button for each CV", () => {
    render(<SeekerCvManager initialCvs={[mockCv, mockCv2]} />);
    const deleteBtns = screen.getAllByRole("button", { name: /cvDelete/i });
    expect(deleteBtns).toHaveLength(2);
  });

  it("calls set-default API and updates UI", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ...mockCv2, isDefault: true } }),
    });
    render(<SeekerCvManager initialCvs={[mockCv, mockCv2]} />);
    const setDefaultBtn = screen.getByRole("button", { name: /cvSetDefault/i });
    await userEvent.click(setDefaultBtn);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/v1/seekers/me/cvs/${mockCv2.id}`,
        expect.objectContaining({ method: "PATCH" }),
      );
      expect(toast.success).toHaveBeenCalledWith("cvSetDefaultSuccess");
    });
  });

  it("calls delete API and removes CV from list", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: null }) });
    render(<SeekerCvManager initialCvs={[mockCv, mockCv2]} />);
    const deleteBtns = screen.getAllByRole("button", { name: /cvDelete/i });
    await userEvent.click(deleteBtns[1]!); // delete mockCv2
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/v1/seekers/me/cvs/${mockCv2.id}`,
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(toast.success).toHaveBeenCalledWith("cvDeleteSuccess");
    });
    expect(screen.queryByText("Technical CV")).toBeNull();
  });

  it("shows limit message when at 5 CVs", () => {
    const fiveCvs = Array.from({ length: 5 }, (_, i) => ({
      ...mockCv,
      id: `cv-${i}`,
      label: `CV ${i}`,
      isDefault: i === 0,
    }));
    render(<SeekerCvManager initialCvs={fiveCvs} />);
    expect(screen.getByText("cvLimitReached")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /cvUpload/i })).toBeNull();
  });

  it("shows upload button and label input when below limit", () => {
    render(<SeekerCvManager initialCvs={[mockCv]} />);
    expect(screen.getByLabelText(/cvLabelLabel/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /cvUpload/i })).toBeTruthy();
  });

  it("shows error toast when delete fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<SeekerCvManager initialCvs={[mockCv]} />);
    const deleteBtn = screen.getByRole("button", { name: /cvDelete/i });
    await userEvent.click(deleteBtn);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("cvDeleteError");
    });
  });

  it("shows error toast when set-default fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<SeekerCvManager initialCvs={[mockCv, mockCv2]} />);
    const setDefaultBtn = screen.getByRole("button", { name: /cvSetDefault/i });
    await userEvent.click(setDefaultBtn);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("cvSetDefaultError");
    });
  });

  it("upload button is disabled when label is empty", () => {
    render(<SeekerCvManager />);
    const uploadBtn = screen.getByRole("button", { name: /cvUpload/i });
    expect(uploadBtn).toBeDisabled();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<SeekerCvManager initialCvs={[mockCv]} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
