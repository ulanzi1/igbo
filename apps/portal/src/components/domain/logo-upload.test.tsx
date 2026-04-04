import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { LogoUpload } from "./logo-upload";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LogoUpload", () => {
  it("renders upload area with placeholder when no logo", () => {
    render(<LogoUpload onUploadComplete={vi.fn()} />);
    expect(screen.getByRole("button")).toBeTruthy();
  });

  it("renders current logo preview when currentLogoUrl provided", () => {
    render(<LogoUpload currentLogoUrl="https://example.com/logo.png" onUploadComplete={vi.fn()} />);
    const img = screen.getByRole("img");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("https://example.com/logo.png");
  });

  it("calls onUploadComplete after successful upload (mock fetch)", async () => {
    const onUploadComplete = vi.fn();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { publicUrl: "https://example.com/new-logo.png" } }),
    });

    render(<LogoUpload onUploadComplete={onUploadComplete} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["data"], "logo.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);

    await waitFor(() => {
      expect(onUploadComplete).toHaveBeenCalledWith("https://example.com/new-logo.png");
    });
  });

  it("shows error for oversized file", async () => {
    const bigData = new Uint8Array(6 * 1024 * 1024);
    render(<LogoUpload onUploadComplete={vi.fn()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([bigData], "big.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
  });

  it("shows error for invalid file type", async () => {
    render(<LogoUpload onUploadComplete={vi.fn()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
  });

  it("passes axe-core accessibility assertion", async () => {
    const { container } = render(<LogoUpload onUploadComplete={vi.fn()} />);
    const results = await axe(container);
    // @ts-expect-error jest-axe matcher
    expect(results).toHaveNoViolations();
  });
});
