import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { VerificationDocumentUpload } from "./verification-document-upload";

function makePdf(name = "doc.pdf", size = 1024) {
  return new File([new Uint8Array(size)], name, { type: "application/pdf" });
}

function makeImage(name = "photo.jpg", size = 512) {
  return new File([new Uint8Array(size)], name, { type: "image/jpeg" });
}

const mockUploadResponse = (fileUploadId: string, originalFilename: string) => ({
  ok: true,
  json: async () => ({
    data: {
      fileUploadId,
      objectKey: `portal/verification/user-1/${fileUploadId}.pdf`,
      originalFilename,
    },
  }),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VerificationDocumentUpload", () => {
  it("renders upload button and hint text", () => {
    const onChange = vi.fn();
    render(<VerificationDocumentUpload onDocumentsChange={onChange} />);
    expect(screen.getByRole("button", { name: /uploadDocuments/ })).toBeTruthy();
    expect(screen.getByText("uploadHint")).toBeTruthy();
  });

  it("shows error for disallowed file type", async () => {
    const onChange = vi.fn();
    render(<VerificationDocumentUpload onDocumentsChange={onChange} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "doc.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("invalidFileType");
  });

  it("shows error for file over 10MB", async () => {
    const onChange = vi.fn();
    render(<VerificationDocumentUpload onDocumentsChange={onChange} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const big = new File([new Uint8Array(11 * 1024 * 1024)], "big.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("fileTooLarge");
  });

  it("uploads a PDF and calls onDocumentsChange", async () => {
    mockFetch.mockResolvedValueOnce(mockUploadResponse("fu-1", "doc.pdf"));
    const onChange = vi.fn();
    render(<VerificationDocumentUpload onDocumentsChange={onChange} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makePdf()] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ fileUploadId: "fu-1", originalFilename: "doc.pdf" }),
    ]);
    expect(screen.getByText("doc.pdf")).toBeTruthy();
  });

  it("uploads a JPEG image", async () => {
    mockFetch.mockResolvedValueOnce(mockUploadResponse("fu-2", "photo.jpg"));
    const onChange = vi.fn();
    render(<VerificationDocumentUpload onDocumentsChange={onChange} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeImage()] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ fileUploadId: "fu-2", originalFilename: "photo.jpg" }),
    ]);
  });

  it("removes a document when remove button is clicked", async () => {
    mockFetch.mockResolvedValueOnce(mockUploadResponse("fu-1", "doc.pdf"));
    const onChange = vi.fn();
    render(<VerificationDocumentUpload onDocumentsChange={onChange} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makePdf()] } });
    await waitFor(() => expect(screen.getByText("doc.pdf")).toBeTruthy());

    const removeBtn = screen.getByRole("button", { name: /removeFile/ });
    fireEvent.click(removeBtn);
    expect(screen.queryByText("doc.pdf")).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("hides upload button after 3 documents", async () => {
    mockFetch
      .mockResolvedValueOnce(mockUploadResponse("fu-1", "a.pdf"))
      .mockResolvedValueOnce(mockUploadResponse("fu-2", "b.pdf"))
      .mockResolvedValueOnce(mockUploadResponse("fu-3", "c.pdf"));
    const onChange = vi.fn();
    render(<VerificationDocumentUpload onDocumentsChange={onChange} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    // Upload 3 files in sequence
    fireEvent.change(input, { target: { files: [makePdf("a.pdf")] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { files: [makePdf("b.pdf")] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    fireEvent.change(input, { target: { files: [makePdf("c.pdf")] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(3));

    // Upload button should be hidden (3 documents = max)
    expect(screen.queryByRole("button", { name: /uploadDocuments/ })).toBeNull();
  });

  it("shows error when upload request fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: "Server error" }),
    });
    const onChange = vi.fn();
    render(<VerificationDocumentUpload onDocumentsChange={onChange} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makePdf()] } });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Server error");
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(<VerificationDocumentUpload onDocumentsChange={vi.fn()} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
