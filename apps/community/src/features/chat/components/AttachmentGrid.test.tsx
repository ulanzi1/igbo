import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { ChatMessageAttachment } from "@/features/chat/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("./ImageAttachment", () => ({
  ImageAttachment: ({ fileName }: { fileName: string }) =>
    React.createElement("div", { "data-testid": "image-attachment" }, fileName),
}));

vi.mock("./FileAttachment", () => ({
  FileAttachment: ({ fileName }: { fileName: string }) =>
    React.createElement("div", { "data-testid": "file-attachment" }, fileName),
}));

import { AttachmentGrid } from "./AttachmentGrid";

const imageAttachment: ChatMessageAttachment = {
  id: "att-1",
  fileUrl: "https://cdn.example.com/photo.webp",
  fileName: "photo.jpg",
  fileType: "image/jpeg",
  fileSize: 100_000,
};

const fileAttachment: ChatMessageAttachment = {
  id: "att-2",
  fileUrl: "https://cdn.example.com/doc.pdf",
  fileName: "document.pdf",
  fileType: "application/pdf",
  fileSize: 250_000,
};

describe("AttachmentGrid", () => {
  it("renders nothing for empty attachments", () => {
    const { container } = render(<AttachmentGrid attachments={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders ImageAttachment for image files", () => {
    render(<AttachmentGrid attachments={[imageAttachment]} />);
    expect(screen.getByTestId("image-attachment")).toBeInTheDocument();
    expect(screen.queryByTestId("file-attachment")).not.toBeInTheDocument();
  });

  it("renders FileAttachment for non-image files", () => {
    render(<AttachmentGrid attachments={[fileAttachment]} />);
    expect(screen.getByTestId("file-attachment")).toBeInTheDocument();
    expect(screen.queryByTestId("image-attachment")).not.toBeInTheDocument();
  });

  it("renders mixed attachments", () => {
    render(<AttachmentGrid attachments={[imageAttachment, fileAttachment]} />);
    expect(screen.getByTestId("image-attachment")).toBeInTheDocument();
    expect(screen.getByTestId("file-attachment")).toBeInTheDocument();
  });

  it("renders multiple images", () => {
    const secondImage: ChatMessageAttachment = {
      ...imageAttachment,
      id: "att-3",
      fileName: "photo2.jpg",
    };
    render(<AttachmentGrid attachments={[imageAttachment, secondImage]} />);
    expect(screen.getAllByTestId("image-attachment")).toHaveLength(2);
  });
});
