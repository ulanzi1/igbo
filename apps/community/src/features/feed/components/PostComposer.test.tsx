// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── Tiptap mocks ─────────────────────────────────────────────────────────────

const mockEditor = {
  getJSON: vi.fn(() => ({ type: "doc", content: [] })),
  getText: vi.fn(() => "test content"),
  isActive: vi.fn(() => false),
  chain: vi.fn(() => ({
    focus: vi.fn(() => ({
      toggleBold: vi.fn(() => ({ run: vi.fn() })),
      toggleItalic: vi.fn(() => ({ run: vi.fn() })),
    })),
  })),
  commands: { clearContent: vi.fn() },
};

vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn(() => mockEditor),
  EditorContent: ({ className }: { className?: string }) => (
    <div data-testid="tiptap-editor" className={className} />
  ),
}));
vi.mock("@tiptap/starter-kit", () => ({ default: {} }));
vi.mock("@tiptap/extension-link", () => ({
  default: { configure: vi.fn(() => ({})) },
}));

// ─── Other mocks ──────────────────────────────────────────────────────────────

const mockInvalidateQueries = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("../actions/create-post", () => ({
  createPost: vi.fn(),
}));

vi.mock("@/components/shared/FileUpload", () => ({
  FileUpload: ({
    onUploadComplete,
  }: {
    onUploadComplete: (id: string, key: string, publicUrl: string) => void;
  }) => (
    <button
      data-testid="file-upload"
      onClick={() =>
        onUploadComplete(
          "upload-1",
          "uploads/photo.jpg",
          "https://s3.example.com/uploads/photo.jpg",
        )
      }
    >
      Upload
    </button>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${namespace}.${key}(${JSON.stringify(params)})`;
    return `${namespace}.${key}`;
  },
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => (
    <img src={src} alt={alt} data-testid="avatar-image" />
  ),
  AvatarFallback: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span data-testid="avatar-fallback" className={className}>
      {children}
    </span>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    type,
    disabled,
    variant,
    size,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    type?: string;
    disabled?: boolean;
    variant?: string;
    size?: string;
  }) => (
    <button
      type={(type as "button" | "submit" | "reset") ?? "button"}
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      data-size={size}
    >
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/dialog", () => ({
  // Render dialog as null in tests — desktop inline form is sufficient to test editor state.
  // The dialog's md:hidden CSS class doesn't apply in jsdom, so rendering both causes duplicates.
  Dialog: ({
    children: _children,
    open: _open,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => null,
  DialogContent: ({ children: _children }: { children: React.ReactNode; className?: string }) =>
    null,
  DialogHeader: ({ children: _children }: { children: React.ReactNode }) => null,
  DialogTitle: ({ children: _children }: { children: React.ReactNode }) => null,
}));

vi.mock("react", async () => ({
  ...(await vi.importActual("react")),
  useTransition: () => [
    false,
    (fn: () => void) => {
      void fn();
    },
  ],
}));

import { PostComposer } from "./PostComposer";
import { createPost } from "../actions/create-post";

const mockCreatePost = vi.mocked(createPost);

const defaultProps = {
  userName: "Jane Doe",
  canCreatePost: true,
  photoUrl: null,
  sort: "chronological" as const,
  filter: "all" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEditor.getText.mockReturnValue("test content");
  mockEditor.getJSON.mockReturnValue({ type: "doc", content: [] });
  mockEditor.isActive.mockReturnValue(false);
});

describe("PostComposer", () => {
  it("renders collapsed trigger with placeholder text when not expanded", () => {
    render(<PostComposer {...defaultProps} />);
    expect(screen.getByText("Feed.composer.placeholderCollapsed")).toBeInTheDocument();
  });

  it("shows tier-blocked message when canCreatePost = false; does NOT render editor", () => {
    render(<PostComposer {...defaultProps} canCreatePost={false} />);
    expect(screen.getByText("Feed.composer.tierBlocked")).toBeInTheDocument();
    expect(screen.queryByTestId("tiptap-editor")).not.toBeInTheDocument();
  });

  it("does NOT render blocked message when canCreatePost = true", () => {
    render(<PostComposer {...defaultProps} />);
    expect(screen.queryByText("Feed.composer.tierBlocked")).not.toBeInTheDocument();
  });

  it("renders tiptap-editor when expanded (dialog open)", () => {
    render(<PostComposer {...defaultProps} />);
    const trigger = screen.getByText("Feed.composer.placeholderCollapsed");
    fireEvent.click(trigger);
    expect(screen.getByTestId("tiptap-editor")).toBeInTheDocument();
  });

  it("shows cancel button when expanded; clicking it collapses the composer", () => {
    render(<PostComposer {...defaultProps} />);
    fireEvent.click(screen.getByText("Feed.composer.placeholderCollapsed"));
    const cancelBtn = screen.getByText("Feed.composer.cancel");
    expect(cancelBtn).toBeInTheDocument();
    fireEvent.click(cancelBtn);
    // After cancel, collapsed trigger should be visible again
    expect(screen.getByText("Feed.composer.placeholderCollapsed")).toBeInTheDocument();
  });

  it("resets category to Discussion when cancel is clicked", () => {
    render(<PostComposer {...defaultProps} />);
    fireEvent.click(screen.getByText("Feed.composer.placeholderCollapsed"));
    // Select "Event"
    const eventBtn = screen.getByText("Feed.composer.categoryEvent");
    fireEvent.click(eventBtn);
    expect(eventBtn).toHaveAttribute("aria-pressed", "true");
    // Cancel
    fireEvent.click(screen.getByText("Feed.composer.cancel"));
    // Re-expand
    fireEvent.click(screen.getByText("Feed.composer.placeholderCollapsed"));
    // Discussion should be selected again (default)
    expect(screen.getByText("Feed.composer.categoryDiscussion")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Feed.composer.categoryEvent")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("shows category buttons (Discussion, Event, Announcement)", () => {
    render(<PostComposer {...defaultProps} />);
    fireEvent.click(screen.getByText("Feed.composer.placeholderCollapsed"));
    expect(screen.getByText("Feed.composer.categoryDiscussion")).toBeInTheDocument();
    expect(screen.getByText("Feed.composer.categoryEvent")).toBeInTheDocument();
    expect(screen.getByText("Feed.composer.categoryAnnouncement")).toBeInTheDocument();
  });

  it("clicking a category button marks it as selected (aria-pressed = true)", () => {
    render(<PostComposer {...defaultProps} />);
    fireEvent.click(screen.getByText("Feed.composer.placeholderCollapsed"));
    const eventBtn = screen.getByText("Feed.composer.categoryEvent");
    fireEvent.click(eventBtn);
    expect(eventBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("shows submit button labeled 'Post' when not pending", () => {
    render(<PostComposer {...defaultProps} />);
    fireEvent.click(screen.getByText("Feed.composer.placeholderCollapsed"));
    expect(screen.getByText("Feed.composer.submit")).toBeInTheDocument();
  });

  it("calls createPost server action on submit button click", async () => {
    mockCreatePost.mockResolvedValue({ success: true, postId: "post-1" });
    mockInvalidateQueries.mockResolvedValue(undefined);

    render(<PostComposer {...defaultProps} />);
    fireEvent.click(screen.getByText("Feed.composer.placeholderCollapsed"));
    fireEvent.click(screen.getByText("Feed.composer.submit"));

    await waitFor(() => {
      expect(mockCreatePost).toHaveBeenCalled();
    });
  });

  it("shows limitReached error message when server action returns LIMIT_REACHED", async () => {
    mockCreatePost.mockResolvedValue({
      success: false,
      errorCode: "LIMIT_REACHED",
      reason: "Feed.composer.limitReached",
      resetDate: new Date("2026-03-09T00:00:00.000Z").toISOString(),
    });

    render(<PostComposer {...defaultProps} />);
    fireEvent.click(screen.getByText("Feed.composer.placeholderCollapsed"));
    fireEvent.click(screen.getByText("Feed.composer.submit"));

    await waitFor(() => {
      // t mock returns "Feed.composer.limitReached(...)"
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("media remove button removes the file from the list", async () => {
    render(<PostComposer {...defaultProps} />);
    fireEvent.click(screen.getByText("Feed.composer.placeholderCollapsed"));

    // Trigger a media upload
    const uploadBtn = screen.getByTestId("file-upload");
    fireEvent.click(uploadBtn);

    // image preview should appear
    await waitFor(() => {
      expect(screen.getByAltText("photo.jpg")).toBeInTheDocument();
    });

    // Click the remove button
    const removeBtn = screen.getByLabelText("Feed.composer.removeMedia");
    fireEvent.click(removeBtn);

    // Image should be gone
    expect(screen.queryByAltText("photo.jpg")).not.toBeInTheDocument();
  });

  it("invalidates feed query on successful post creation", async () => {
    mockCreatePost.mockResolvedValue({ success: true, postId: "post-1" });
    mockInvalidateQueries.mockResolvedValue(undefined);

    render(<PostComposer {...defaultProps} />);
    fireEvent.click(screen.getByText("Feed.composer.placeholderCollapsed"));
    fireEvent.click(screen.getByText("Feed.composer.submit"));

    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["feed"] }),
      );
    });
  });
});
