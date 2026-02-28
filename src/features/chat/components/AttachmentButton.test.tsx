import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/utils", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));

vi.mock("lucide-react", () => ({
  PaperclipIcon: () => null,
}));

import { AttachmentButton } from "./AttachmentButton";

describe("AttachmentButton", () => {
  it("renders a button with aria-label from i18n", () => {
    render(<AttachmentButton onFilesSelected={vi.fn()} />);
    expect(screen.getByRole("button", { name: "attach" })).toBeInTheDocument();
  });

  it("calls onFilesSelected with selected files", () => {
    const onFilesSelected = vi.fn();
    render(<AttachmentButton onFilesSelected={onFilesSelected} />);

    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    expect(input).toBeTruthy();

    const file = new File(["content"], "test.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
  });

  it("does not call onFilesSelected when no files selected", () => {
    const onFilesSelected = vi.fn();
    render(<AttachmentButton onFilesSelected={onFilesSelected} />);

    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [], configurable: true });
    fireEvent.change(input);

    expect(onFilesSelected).not.toHaveBeenCalled();
  });

  it("disables button when disabled=true", () => {
    render(<AttachmentButton onFilesSelected={vi.fn()} disabled={true} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("has hidden file input", () => {
    render(<AttachmentButton onFilesSelected={vi.fn()} />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    expect(input.className).toContain("sr-only");
    expect(input.getAttribute("aria-hidden")).toBe("true");
    expect(input.getAttribute("multiple")).not.toBeNull();
  });
});
