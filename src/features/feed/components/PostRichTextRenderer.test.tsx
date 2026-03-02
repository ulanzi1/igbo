// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("@tiptap/react", () => ({
  useEditor: (_opts: unknown) => ({
    getHTML: () => "<p>Rendered</p>",
    destroy: vi.fn(),
  }),
  EditorContent: ({ editor }: { editor: unknown }) =>
    editor ? <div data-testid="editor-content">Editor Content</div> : null,
}));

vi.mock("@tiptap/starter-kit", () => ({
  default: {},
}));

vi.mock("@tiptap/extension-link", () => ({
  default: { configure: vi.fn(() => ({})) },
}));

import { PostRichTextRenderer } from "./PostRichTextRenderer";

describe("PostRichTextRenderer", () => {
  it("renders Tiptap editor with valid JSON content", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
    });

    render(<PostRichTextRenderer content={content} />);

    expect(screen.getByTestId("editor-content")).toBeInTheDocument();
  });

  it("falls back to plain text when JSON is invalid", () => {
    render(<PostRichTextRenderer content="Just plain text, not JSON" />);

    expect(screen.getByText("Just plain text, not JSON")).toBeInTheDocument();
    expect(screen.queryByTestId("editor-content")).not.toBeInTheDocument();
  });

  it("falls back to plain text for malformed JSON", () => {
    render(<PostRichTextRenderer content="{invalid json}" />);

    expect(screen.getByText("{invalid json}")).toBeInTheDocument();
  });

  it("renders with empty doc content", () => {
    const content = JSON.stringify({ type: "doc", content: [] });
    render(<PostRichTextRenderer content={content} />);

    expect(screen.getByTestId("editor-content")).toBeInTheDocument();
  });
});
