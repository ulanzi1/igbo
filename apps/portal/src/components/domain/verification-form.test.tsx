import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("./verification-document-upload", () => ({
  VerificationDocumentUpload: ({
    onDocumentsChange,
  }: {
    onDocumentsChange: (
      docs: Array<{ fileUploadId: string; objectKey: string; originalFilename: string }>,
    ) => void;
  }) => (
    <button
      data-testid="mock-upload"
      onClick={() =>
        onDocumentsChange([
          {
            fileUploadId: "fu-1",
            objectKey: "portal/verification/user-1/doc.pdf",
            originalFilename: "doc.pdf",
          },
        ])
      }
    >
      Upload Mock
    </button>
  ),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { VerificationForm } from "./verification-form";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VerificationForm", () => {
  it("renders the form with submit button disabled when no documents", () => {
    render(<VerificationForm companyId="company-1" />);
    const submitBtn = screen.getByRole("button", { name: "submit" });
    expect(submitBtn).toBeTruthy();
    expect(submitBtn.hasAttribute("disabled")).toBe(true);
  });

  it("enables submit after documents are added", () => {
    render(<VerificationForm companyId="company-1" />);
    fireEvent.click(screen.getByTestId("mock-upload"));
    const submitBtn = screen.getByRole("button", { name: "submit" });
    expect(submitBtn.hasAttribute("disabled")).toBe(false);
  });

  it("shows error when submitting with no documents", () => {
    render(<VerificationForm companyId="company-1" />);
    // Try submitting the form via form element
    const form = document.querySelector("form")!;
    fireEvent.submit(form);
    expect(screen.getByTestId("submit-error")).toBeTruthy();
    expect(screen.getByTestId("submit-error").textContent).toContain("fileRequired");
  });

  it("submits verification request on form submit with documents", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { id: "ver-1" } }),
    });
    render(<VerificationForm companyId="company-1" />);
    fireEvent.click(screen.getByTestId("mock-upload"));
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/companies/company-1/verification",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("fu-1"),
        }),
      ),
    );
  });

  it("shows success message after successful submission", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { id: "ver-1" } }),
    });
    render(<VerificationForm companyId="company-1" />);
    fireEvent.click(screen.getByTestId("mock-upload"));
    fireEvent.click(screen.getByRole("button", { name: "submit" }));
    expect(await screen.findByTestId("success-message")).toBeTruthy();
    expect(screen.getByTestId("success-message").textContent).toContain("success");
  });

  it("shows alreadyPending error for 409 response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ detail: "Already pending" }),
    });
    render(<VerificationForm companyId="company-1" />);
    fireEvent.click(screen.getByTestId("mock-upload"));
    fireEvent.click(screen.getByRole("button", { name: "submit" }));
    expect(await screen.findByTestId("submit-error")).toBeTruthy();
    expect(screen.getByTestId("submit-error").textContent).toContain("alreadyPending");
  });

  it("shows generic error for non-409 failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: "Server error" }),
    });
    render(<VerificationForm companyId="company-1" />);
    fireEvent.click(screen.getByTestId("mock-upload"));
    fireEvent.click(screen.getByRole("button", { name: "submit" }));
    expect(await screen.findByTestId("submit-error")).toBeTruthy();
    expect(screen.getByTestId("submit-error").textContent).toContain("Server error");
  });

  it("has cancel button that navigates back", () => {
    render(<VerificationForm companyId="company-1" />);
    expect(screen.getByRole("button", { name: "cancel" })).toBeTruthy();
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(<VerificationForm companyId="company-1" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
