import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

// Mock Tiptap modules — hoisted before imports
vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn(),
  EditorContent: ({ editor }: { editor: unknown }) =>
    editor ? <div data-testid="editor-content" /> : null,
}));

vi.mock("@tiptap/starter-kit", () => ({ default: {} }));
vi.mock("@tiptap/extension-link", () => ({
  default: { configure: vi.fn(() => ({})) },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

import { useEditor } from "@tiptap/react";
import { PortalRichTextEditor, PortalRichTextEditorSkeleton } from "./portal-rich-text-editor";

const createMockEditor = (overrides: Record<string, unknown> = {}) => ({
  getHTML: vi.fn(() => "<p>test content</p>"),
  getText: vi.fn(() => "test content"),
  isActive: vi.fn(() => false),
  chain: vi.fn(() => ({
    focus: vi.fn(() => ({
      toggleHeading: vi.fn(() => ({ run: vi.fn() })),
      toggleBold: vi.fn(() => ({ run: vi.fn() })),
      toggleItalic: vi.fn(() => ({ run: vi.fn() })),
      toggleBulletList: vi.fn(() => ({ run: vi.fn() })),
      toggleOrderedList: vi.fn(() => ({ run: vi.fn() })),
      toggleBlockquote: vi.fn(() => ({ run: vi.fn() })),
      setLink: vi.fn(() => ({ run: vi.fn() })),
      unsetLink: vi.fn(() => ({ run: vi.fn() })),
      run: vi.fn(),
    })),
  })),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useEditor).mockReturnValue(
    createMockEditor() as unknown as ReturnType<typeof useEditor>,
  );
});

describe("PortalRichTextEditor", () => {
  it("renders toolbar with H2, H3, Bold, Italic, Lists, Blockquote, Link buttons", () => {
    render(<PortalRichTextEditor content="" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "heading2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "heading3" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "bold" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "italic" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "bulletList" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "orderedList" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "blockquote" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "link" })).toBeTruthy();
  });

  it("renders editor content area", () => {
    render(<PortalRichTextEditor content="<p>Initial</p>" onChange={() => {}} />);
    expect(screen.getByTestId("editor-content")).toBeTruthy();
  });

  it("calls onChange with HTML string (not JSON) when editor updates", () => {
    let capturedOnUpdate:
      | ((args: { editor: ReturnType<typeof createMockEditor> }) => void)
      | undefined;
    vi.mocked(useEditor).mockImplementation((opts) => {
      // capture the onUpdate callback
      capturedOnUpdate = (opts as { onUpdate?: typeof capturedOnUpdate })?.onUpdate;
      return createMockEditor() as unknown as ReturnType<typeof useEditor>;
    });

    const onChange = vi.fn();
    render(<PortalRichTextEditor content="" onChange={onChange} />);

    const mockEditor = createMockEditor();
    capturedOnUpdate?.({ editor: mockEditor });
    expect(onChange).toHaveBeenCalledWith("<p>test content</p>");
  });

  it("shows character count", () => {
    render(<PortalRichTextEditor content="" onChange={() => {}} />);
    // The mock getText returns "test content" (12 chars) → shows "characterCount:..."
    expect(screen.getByText(/characterCount/)).toBeTruthy();
  });

  it("shows warning styling when text exceeds 10000 characters (no maxLength set)", () => {
    vi.mocked(useEditor).mockReturnValue(
      createMockEditor({ getText: vi.fn(() => "a".repeat(10001)) }) as unknown as ReturnType<
        typeof useEditor
      >,
    );
    const { container } = render(<PortalRichTextEditor content="" onChange={() => {}} />);
    expect(container.querySelector(".text-destructive")).toBeTruthy();
  });

  it("shows warning when content exceeds explicit maxLength", () => {
    vi.mocked(useEditor).mockReturnValue(
      createMockEditor({ getText: vi.fn(() => "a".repeat(5001)) }) as unknown as ReturnType<
        typeof useEditor
      >,
    );
    const { container } = render(
      <PortalRichTextEditor content="" onChange={() => {}} maxLength={5000} />,
    );
    expect(container.querySelector(".text-destructive")).toBeTruthy();
  });

  it("applies aria-label to editor wrapper group", () => {
    render(
      <PortalRichTextEditor content="" onChange={() => {}} aria-label="Job Description Editor" />,
    );
    expect(screen.getByRole("group", { name: "Job Description Editor" })).toBeTruthy();
  });

  it("passes axe-core accessibility assertion", async () => {
    const { container } = render(
      <PortalRichTextEditor content="" onChange={() => {}} aria-label="Test Editor" />,
    );
    const results = await axe(container);
    // @ts-expect-error jest-axe matcher not in vitest types
    expect(results).toHaveNoViolations();
  });
});

describe("PortalRichTextEditorSkeleton", () => {
  it("renders skeleton placeholder", () => {
    const { container } = render(<PortalRichTextEditorSkeleton />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });
});
