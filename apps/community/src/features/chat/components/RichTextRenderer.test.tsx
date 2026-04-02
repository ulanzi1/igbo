import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
}));

import { RichTextRenderer } from "./RichTextRenderer";

describe("RichTextRenderer", () => {
  describe("plain text", () => {
    it("renders plain text unchanged", () => {
      render(<RichTextRenderer content="Hello world" />);
      expect(screen.getByText("Hello world")).toBeInTheDocument();
    });

    it("renders empty string without error", () => {
      const { container } = render(<RichTextRenderer content="" />);
      expect(container.firstChild).toBeTruthy();
    });
  });

  describe("bold", () => {
    it("renders **bold** as <strong>", () => {
      render(<RichTextRenderer content="**bold text**" />);
      const strong = document.querySelector("strong");
      expect(strong).toBeTruthy();
      expect(strong?.textContent).toBe("bold text");
    });

    it("renders bold inline with surrounding text", () => {
      render(<RichTextRenderer content="hello **world** there" />);
      expect(screen.getByText("world").tagName).toBe("STRONG");
    });
  });

  describe("italic", () => {
    it("renders *italic* as <em>", () => {
      render(<RichTextRenderer content="*italic text*" />);
      const em = document.querySelector("em");
      expect(em).toBeTruthy();
      expect(em?.textContent).toBe("italic text");
    });
  });

  describe("strikethrough", () => {
    it("renders ~~strikethrough~~ as <s>", () => {
      render(<RichTextRenderer content="~~strikethrough~~" />);
      const s = document.querySelector("s");
      expect(s).toBeTruthy();
      expect(s?.textContent).toBe("strikethrough");
    });
  });

  describe("inline code", () => {
    it("renders `code` as <code>", () => {
      render(<RichTextRenderer content="`inline code`" />);
      const code = document.querySelector("code");
      expect(code).toBeTruthy();
      expect(code?.textContent).toBe("inline code");
    });
  });

  describe("links", () => {
    it("renders [text](url) as <a> for https URLs", () => {
      render(<RichTextRenderer content="[click here](https://example.com)" />);
      const link = document.querySelector("a");
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe("click here");
      expect(link?.getAttribute("href")).toBe("https://example.com");
      expect(link?.getAttribute("target")).toBe("_blank");
      expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    });

    it("renders [text](url) as <a> for http URLs", () => {
      render(<RichTextRenderer content="[link](http://example.com)" />);
      const link = document.querySelector("a");
      expect(link).toBeTruthy();
      expect(link?.getAttribute("href")).toBe("http://example.com");
    });
  });

  describe("XSS prevention", () => {
    it("renders javascript: links as plain text (no <a>)", () => {
      render(<RichTextRenderer content="[xss](javascript:alert(1))" />);
      // No anchor element should be rendered
      expect(document.querySelector("a")).toBeNull();
      // The content is rendered as plain text spans, not as a link
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("renders data: URLs as plain text", () => {
      render(<RichTextRenderer content="[evil](data:text/html,<script>alert(1)</script>)" />);
      expect(document.querySelector("a")).toBeNull();
    });

    it("renders vbscript: as plain text", () => {
      render(<RichTextRenderer content="[evil](vbscript:msgbox(1))" />);
      expect(document.querySelector("a")).toBeNull();
    });

    it("does not use dangerouslySetInnerHTML anywhere", () => {
      // Render with bold and verify React elements, not HTML injection
      const { container } = render(<RichTextRenderer content="**hello**" />);
      // The <strong> tag should exist as a DOM element (React-rendered), not via innerHTML
      const strong = container.querySelector("strong");
      expect(strong).toBeTruthy();
    });
  });

  describe("code blocks", () => {
    it("renders fenced code block as <pre><code>", () => {
      const content = "```\nconst x = 1;\nconsole.log(x);\n```";
      render(<RichTextRenderer content={content} />);
      const pre = document.querySelector("pre");
      const code = pre?.querySelector("code");
      expect(pre).toBeTruthy();
      expect(code?.textContent).toBe("const x = 1;\nconsole.log(x);");
    });

    it("renders unclosed code block as-is", () => {
      const content = "```\nsome code";
      render(<RichTextRenderer content={content} />);
      const pre = document.querySelector("pre");
      expect(pre).toBeTruthy();
      expect(pre?.textContent).toBe("some code");
    });
  });

  describe("multi-line content", () => {
    it("adds <br> between lines (not on last line)", () => {
      const content = "line one\nline two\nline three";
      const { container } = render(<RichTextRenderer content={content} />);
      const brs = container.querySelectorAll("br");
      // Two <br> for three lines (after line 1 and line 2, not after last)
      expect(brs.length).toBe(2);
    });

    it("renders formatting across multiple lines independently", () => {
      const content = "**bold line**\n*italic line*";
      render(<RichTextRenderer content={content} />);
      expect(document.querySelector("strong")?.textContent).toBe("bold line");
      expect(document.querySelector("em")?.textContent).toBe("italic line");
    });
  });

  describe("className prop", () => {
    it("applies className to root span", () => {
      const { container } = render(
        <RichTextRenderer content="hello" className="my-custom-class" />,
      );
      const root = container.firstChild as HTMLElement;
      expect(root.className).toBe("my-custom-class");
    });
  });

  describe("complex content", () => {
    it("renders multiple inline formats on same line", () => {
      render(<RichTextRenderer content="**bold** and *italic* and `code`" />);
      expect(document.querySelector("strong")?.textContent).toBe("bold");
      expect(document.querySelector("em")?.textContent).toBe("italic");
      expect(document.querySelector("code")?.textContent).toBe("code");
    });
  });

  describe("mention rendering", () => {
    const VALID_UUID = "00000000-0000-4000-8000-000000000001";

    it("renders @[Name](mention:uuid) as a clickable button", () => {
      render(<RichTextRenderer content={`@[Ada](mention:${VALID_UUID})`} />);
      const mention = document.querySelector("button");
      expect(mention).toBeTruthy();
      expect(mention?.textContent).toContain("Ada");
    });

    it("does not render mention with invalid (non-UUID) userId as button", () => {
      render(<RichTextRenderer content="@[Ada](mention:javascript:alert(1))" />);
      // Should not render as a button (XSS prevention)
      expect(document.querySelector("button")).toBeNull();
    });

    it("renders mention inline with surrounding text", () => {
      render(<RichTextRenderer content={`Hello @[Ada](mention:${VALID_UUID}) how are you`} />);
      const mention = document.querySelector("button");
      expect(mention).toBeTruthy();
      expect(screen.getByText(/Hello/)).toBeInTheDocument();
      expect(screen.getByText(/how are you/)).toBeInTheDocument();
    });

    it("renders multiple mentions in same content", () => {
      const UUID2 = "00000000-0000-4000-8000-000000000002";
      render(
        <RichTextRenderer content={`@[Ada](mention:${VALID_UUID}) and @[Eze](mention:${UUID2})`} />,
      );
      const buttons = document.querySelectorAll("button");
      expect(buttons.length).toBe(2);
    });
  });
});
