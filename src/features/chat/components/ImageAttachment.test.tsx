import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("lucide-react", () => ({
  XIcon: () => null,
}));

import { ImageAttachment } from "./ImageAttachment";

const FILE_URL = "https://cdn.example.com/photo.webp";
const FILE_NAME = "photo.jpg";

describe("ImageAttachment", () => {
  it("renders thumbnail image", () => {
    render(<ImageAttachment fileUrl={FILE_URL} fileName={FILE_NAME} />);
    const img = screen.getByRole("img", { name: FILE_NAME });
    expect(img).toHaveAttribute("src", FILE_URL);
  });

  it("opens lightbox on thumbnail click", () => {
    render(<ImageAttachment fileUrl={FILE_URL} fileName={FILE_NAME} />);
    const button = screen.getByRole("button", { name: "imagePreview" });
    fireEvent.click(button);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes lightbox on backdrop click", () => {
    render(<ImageAttachment fileUrl={FILE_URL} fileName={FILE_NAME} />);
    fireEvent.click(screen.getByRole("button", { name: "imagePreview" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes lightbox on Escape key", () => {
    render(<ImageAttachment fileUrl={FILE_URL} fileName={FILE_NAME} />);
    fireEvent.click(screen.getByRole("button", { name: "imagePreview" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not close lightbox when clicking image inside", () => {
    render(<ImageAttachment fileUrl={FILE_URL} fileName={FILE_NAME} />);
    fireEvent.click(screen.getByRole("button", { name: "imagePreview" }));
    // The full-size img inside lightbox
    const lightboxImgs = screen.getAllByRole("img", { name: FILE_NAME });
    // Second img is inside the lightbox
    const lightboxImg = lightboxImgs[lightboxImgs.length - 1]!;
    fireEvent.click(lightboxImg);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
