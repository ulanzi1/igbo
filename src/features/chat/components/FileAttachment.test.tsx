import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("lucide-react", () => ({
  FileIcon: () => null,
  VideoIcon: () => null,
  FileTextIcon: () => null,
}));

import { FileAttachment } from "./FileAttachment";

const FILE_URL = "https://cdn.example.com/doc.pdf";
const FILE_NAME = "document.pdf";

describe("FileAttachment", () => {
  it("renders a download link with file name", () => {
    render(<FileAttachment fileUrl={FILE_URL} fileName={FILE_NAME} fileType="application/pdf" />);
    const link = screen.getByRole("link", { name: "download" });
    expect(link).toHaveAttribute("href", FILE_URL);
    expect(link).toHaveAttribute("download", FILE_NAME);
    expect(screen.getByText(FILE_NAME)).toBeInTheDocument();
  });

  it("shows formatted file size", () => {
    render(
      <FileAttachment
        fileUrl={FILE_URL}
        fileName={FILE_NAME}
        fileType="application/pdf"
        fileSize={1024 * 1024 * 2.5}
      />,
    );
    expect(screen.getByText("2.5 MB")).toBeInTheDocument();
  });

  it("shows KB for smaller files", () => {
    render(
      <FileAttachment
        fileUrl={FILE_URL}
        fileName={FILE_NAME}
        fileType="application/pdf"
        fileSize={512 * 1024}
      />,
    );
    expect(screen.getByText("512.0 KB")).toBeInTheDocument();
  });

  it("does not show size when fileSize is null", () => {
    render(
      <FileAttachment
        fileUrl={FILE_URL}
        fileName={FILE_NAME}
        fileType="application/pdf"
        fileSize={null}
      />,
    );
    // No KB/MB text
    expect(screen.queryByText(/KB|MB/)).not.toBeInTheDocument();
  });

  it("has rel=noopener noreferrer for security", () => {
    render(<FileAttachment fileUrl={FILE_URL} fileName={FILE_NAME} />);
    expect(screen.getByRole("link")).toHaveAttribute("rel", "noopener noreferrer");
  });
});
