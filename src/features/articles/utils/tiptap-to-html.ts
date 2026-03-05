/**
 * Server-safe Tiptap JSON → HTML serializer.
 * No DOM, no window — runs in Node.js for SSR/ISR.
 * Handles all node/mark types produced by TiptapEditor.tsx.
 */

type TiptapMark = { type: string; attrs?: Record<string, unknown> };
type TiptapNode = {
  type: string;
  text?: string;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  attrs?: Record<string, unknown>;
};

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyMarks(html: string, marks: TiptapMark[]): string {
  return marks.reduce((acc, mark) => {
    switch (mark.type) {
      case "bold":
        return `<strong>${acc}</strong>`;
      case "italic":
        return `<em>${acc}</em>`;
      case "strike":
        return `<s>${acc}</s>`;
      case "code":
        return `<code>${acc}</code>`;
      case "link": {
        const href = esc(String(mark.attrs?.href ?? ""));
        const target =
          mark.attrs?.target === "_blank" ? ' target="_blank" rel="noopener noreferrer"' : "";
        return `<a href="${href}"${target}>${acc}</a>`;
      }
      default:
        return acc;
    }
  }, html);
}

function nodeToHtml(node: TiptapNode): string {
  if (node.type === "text") {
    return applyMarks(esc(node.text ?? ""), node.marks ?? []);
  }

  const inner = (node.content ?? []).map(nodeToHtml).join("");

  switch (node.type) {
    case "doc":
      return inner;
    case "paragraph":
      return `<p>${inner}</p>`;
    case "heading": {
      const level = Number(node.attrs?.level ?? 1);
      return `<h${level}>${inner}</h${level}>`;
    }
    case "bulletList":
      return `<ul>${inner}</ul>`;
    case "orderedList":
      return `<ol>${inner}</ol>`;
    case "listItem":
      return `<li>${inner}</li>`;
    case "blockquote":
      return `<blockquote>${inner}</blockquote>`;
    case "codeBlock":
      return `<pre><code>${inner}</code></pre>`;
    case "hardBreak":
      return `<br />`;
    case "horizontalRule":
      return `<hr />`;
    case "image": {
      const src = esc(String(node.attrs?.src ?? ""));
      const alt = esc(String(node.attrs?.alt ?? ""));
      return `<img src="${src}" alt="${alt}" />`;
    }
    case "mention": {
      const label = esc(String(node.attrs?.label ?? node.attrs?.id ?? ""));
      return `<span class="mention">@${label}</span>`;
    }
    default:
      return inner;
  }
}

export function tiptapJsonToHtml(json: string): string {
  try {
    const doc = JSON.parse(json) as TiptapNode;
    return nodeToHtml(doc);
  } catch {
    return "";
  }
}
