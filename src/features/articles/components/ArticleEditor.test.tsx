// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@/test/test-utils";

// ─── Tiptap mocks ─────────────────────────────────────────────────────────────

type OnUpdateCallback = (props: { editor: { getJSON: () => object } }) => void;

interface MockEditorInstance {
  getJSON: ReturnType<typeof vi.fn>;
  isActive: ReturnType<typeof vi.fn>;
  chain: ReturnType<typeof vi.fn>;
  commands: { clearContent: ReturnType<typeof vi.fn> };
}

const createMockEditor = (): MockEditorInstance => ({
  getJSON: vi.fn(() => ({ type: "doc", content: [] })),
  isActive: vi.fn(() => false),
  chain: vi.fn(() => ({
    focus: vi.fn(() => ({
      toggleBold: vi.fn(() => ({ run: vi.fn() })),
      toggleItalic: vi.fn(() => ({ run: vi.fn() })),
      toggleHeading: vi.fn(() => ({ run: vi.fn() })),
      toggleBulletList: vi.fn(() => ({ run: vi.fn() })),
      toggleOrderedList: vi.fn(() => ({ run: vi.fn() })),
      toggleBlockquote: vi.fn(() => ({ run: vi.fn() })),
      setLink: vi.fn(() => ({ run: vi.fn() })),
      setImage: vi.fn(() => ({ run: vi.fn() })),
    })),
  })),
  commands: { clearContent: vi.fn() },
});

// Capture onUpdate callbacks for each useEditor call
const capturedOnUpdates: (OnUpdateCallback | undefined)[] = [];

vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn((config: { onUpdate?: OnUpdateCallback }) => {
    capturedOnUpdates.push(config?.onUpdate);
    return createMockEditor();
  }),
  EditorContent: () => <div data-testid="tiptap-editor-content" />,
}));

vi.mock("@tiptap/starter-kit", () => ({ default: {} }));
vi.mock("@tiptap/extension-image", () => ({
  default: { configure: vi.fn(() => ({})) },
}));
vi.mock("@tiptap/extension-link", () => ({
  default: { configure: vi.fn(() => ({})) },
}));
vi.mock("@tiptap/extension-mention", () => ({
  default: { configure: vi.fn(() => ({})) },
}));

vi.mock("../utils/mention-suggestion", () => ({
  buildMentionSuggestion: vi.fn(() => ({})),
}));

// ─── Other mocks ──────────────────────────────────────────────────────────────

const mockSaveDraftAction = vi.fn();
const mockSubmitArticleAction = vi.fn();

vi.mock("../actions/article-actions", () => ({
  saveDraftAction: (...args: unknown[]) => mockSaveDraftAction(...args),
  submitArticleAction: (...args: unknown[]) => mockSubmitArticleAction(...args),
}));

vi.mock("@/components/shared/FileUpload", () => ({
  FileUpload: ({
    onUploadComplete,
  }: {
    onUploadComplete: (id: string, key: string, url: string) => void;
  }) => (
    <button
      data-testid="cover-image-upload"
      onClick={() =>
        onUploadComplete("upload-1", "images/cover.jpg", "https://cdn.example.com/cover.jpg")
      }
    >
      Upload Cover
    </button>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    "aria-label": ariaLabel,
    type,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    "aria-label"?: string;
    type?: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      type={type ?? "button"}
      data-testid={ariaLabel ?? undefined}
    >
      {children}
    </button>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ""}.${key}`,
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import { ArticleEditor } from "./ArticleEditor";
import type { ArticleEditorInitialData } from "./ArticleEditor";

const ARTICLE_ID = "00000000-0000-4000-8000-000000000001";

const initialData: ArticleEditorInitialData = {
  articleId: ARTICLE_ID,
  title: "",
  content: '{"type":"doc","content":[]}',
  category: "discussion",
  visibility: "members_only",
};

const filledInitialData: ArticleEditorInitialData = {
  ...initialData,
  title: "My Article Title",
  content:
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]}',
  coverImageUrl: "/uploads/cover.jpg",
};

beforeEach(() => {
  capturedOnUpdates.length = 0;
  mockSaveDraftAction.mockReset();
  mockSubmitArticleAction.mockReset();
  mockSaveDraftAction.mockResolvedValue({
    success: true,
    articleId: ARTICLE_ID,
    slug: "test-slug",
  });
});

describe("ArticleEditor", () => {
  it("renders English and Igbo pane labels in the mobile tab bar", () => {
    render(<ArticleEditor articleId={ARTICLE_ID} initialData={initialData} />);

    // The tab bar has both labels as buttons
    const tabs = screen.getAllByRole("button", {
      name: /Articles\.editor\.(englishPane|igboPane)/,
    });
    expect(tabs.length).toBeGreaterThanOrEqual(2);
  });

  it("renders two Tiptap editor instances (always mounted)", () => {
    render(<ArticleEditor articleId={ARTICLE_ID} initialData={initialData} />);

    const editors = screen.getAllByTestId("tiptap-editor-content");
    expect(editors.length).toBe(2);
  });

  it("Submit for Review button is disabled when English title is empty", () => {
    render(<ArticleEditor articleId={ARTICLE_ID} initialData={initialData} />);

    const submitBtn = screen.getByText("Articles.submit.button");
    expect(submitBtn).toBeDisabled();
  });

  it("Submit for Review button is disabled when English body is empty even if title is filled", () => {
    // Render with title but empty content
    render(
      <ArticleEditor articleId={ARTICLE_ID} initialData={{ ...initialData, title: "A Title" }} />,
    );

    const submitBtn = screen.getByText("Articles.submit.button");
    expect(submitBtn).toBeDisabled();
  });

  it("Submit for Review button is enabled when English title and body are both filled", () => {
    // filledInitialData has non-empty title AND non-empty content
    render(<ArticleEditor articleId={ARTICLE_ID} initialData={filledInitialData} />);

    const submitBtn = screen.getByText("Articles.submit.button");
    expect(submitBtn).not.toBeDisabled();
  });

  it("mobile tab toggle: both Tiptap instances remain in DOM after switching to Igbo tab", () => {
    render(<ArticleEditor articleId={ARTICLE_ID} initialData={initialData} />);

    // Initially 2 editors
    expect(screen.getAllByTestId("tiptap-editor-content").length).toBe(2);

    // Click the Igbo tab button (the one in the mobile tab bar — role=button with aria-pressed)
    const igboTabBtn = screen
      .getAllByRole("button")
      .find((btn) => btn.textContent === "Articles.editor.igboPane" && btn.tagName === "BUTTON");
    expect(igboTabBtn).toBeDefined();
    act(() => {
      fireEvent.click(igboTabBtn!);
    });

    // Both editors should still be in the DOM (no unmount)
    expect(screen.getAllByTestId("tiptap-editor-content").length).toBe(2);
  });

  it("Igbo title validation message appears when Igbo body has content but Igbo title is empty", () => {
    render(<ArticleEditor articleId={ARTICLE_ID} initialData={initialData} />);

    // Trigger content update in the Igbo TiptapEditor (index 1 = second useEditor call)
    const nonEmptyDoc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Igbo content" }] }],
    };

    act(() => {
      // The second onUpdate callback corresponds to the Igbo TiptapEditor
      capturedOnUpdates[1]?.({ editor: { getJSON: () => nonEmptyDoc } });
    });

    // Validation message should appear
    expect(screen.getByText("Articles.validation.igboTitleRequired")).toBeInTheDocument();
  });

  it("cover image upload stores cover image URL without crashing", () => {
    render(<ArticleEditor articleId={ARTICLE_ID} initialData={initialData} />);

    const uploadBtn = screen.getByTestId("cover-image-upload");
    act(() => {
      fireEvent.click(uploadBtn);
    });

    // After upload, the remove button should appear
    expect(screen.getByText("×")).toBeInTheDocument();
  });

  it("shows ReSubmit button label when status is revision_requested", () => {
    render(
      <ArticleEditor
        articleId={ARTICLE_ID}
        initialData={{
          ...filledInitialData,
          status: "revision_requested",
          rejectionFeedback: "Fix intro",
        }}
      />,
    );

    expect(screen.getByText("Articles.submit.resubmitButton")).toBeInTheDocument();
    // Should NOT show the regular submit label
    expect(screen.queryByText("Articles.submit.button")).not.toBeInTheDocument();
  });

  it("shows ReSubmit button label when status is rejected", () => {
    render(
      <ArticleEditor
        articleId={ARTICLE_ID}
        initialData={{
          ...filledInitialData,
          status: "rejected",
          rejectionFeedback: "Not suitable",
        }}
      />,
    );

    expect(screen.getByText("Articles.submit.resubmitButton")).toBeInTheDocument();
  });

  it("shows amber revision banner when status is revision_requested", () => {
    render(
      <ArticleEditor
        articleId={ARTICLE_ID}
        initialData={{
          ...filledInitialData,
          status: "revision_requested",
          rejectionFeedback: "Expand section 2",
        }}
      />,
    );

    expect(screen.getByText("Articles.revision.bannerTitle")).toBeInTheDocument();
    expect(screen.getByText("Articles.revision.bannerBody")).toBeInTheDocument();
    expect(screen.getByText("Expand section 2")).toBeInTheDocument();
  });

  it("shows cover image required hint when no cover image", () => {
    render(
      <ArticleEditor articleId={ARTICLE_ID} initialData={{ ...initialData, title: "A Title" }} />,
    );

    expect(screen.getByText("Articles.meta.coverImageRequired")).toBeInTheDocument();
  });

  it("submit button is disabled when cover image is missing even if content is valid", () => {
    const dataWithoutCover = { ...filledInitialData, coverImageUrl: undefined };
    render(<ArticleEditor articleId={ARTICLE_ID} initialData={dataWithoutCover} />);

    // Should show resubmit or submit button, but it should be disabled
    const submitBtn = screen.getByText("Articles.submit.button");
    expect(submitBtn).toBeDisabled();
  });
});
