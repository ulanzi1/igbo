"use client";

import type { ReactNode } from "react";
import { useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";

/**
 * Allowed URL schemes for link rendering.
 * Only http/https to prevent javascript: and data: XSS vectors.
 */
const ALLOWED_URL_SCHEMES = ["http:", "https:"];

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_URL_SCHEMES.includes(parsed.protocol);
  } catch {
    return false;
  }
}

/** Validate UUID format to prevent javascript: injection in mention hrefs */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isSafeUserId(userId: string): boolean {
  return UUID_REGEX.test(userId);
}

interface Segment {
  type: "bold" | "italic" | "strikethrough" | "code" | "link" | "mention" | "text";
  content: string;
  url?: string; // for type="link"
  userId?: string; // for type="mention"
}

/**
 * Parse a single line of markdown-subset text into typed segments.
 * Supports: @[Name](mention:userId), **bold**, *italic*, ~~strikethrough~~, `inline code`, [text](url)
 *
 * XSS safety: outputs React elements only, never dangerouslySetInnerHTML.
 * Links filtered to http/https only. Mention userIds validated as UUID format.
 * Mentions are processed first (before other patterns) to avoid double-processing.
 */
function parseLine(line: string): Segment[] {
  const segments: Segment[] = [];

  // Token-based parsing with a single regex for all patterns
  // Priority: mentions > code > links > bold > italic > strikethrough
  const tokenRegex =
    /@\[([^\]]+)\]\(mention:([^)]+)\)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|~~([^~]+)~~|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(line)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: line.slice(lastIndex, match.index) });
    }

    if (match[1] !== undefined) {
      // @[Name](mention:userId)
      const displayName = match[1];
      const userId = match[2] ?? "";
      if (displayName && isSafeUserId(userId)) {
        segments.push({ type: "mention", content: displayName, userId });
      } else {
        // Malformed mention — render as plain text (no crash)
        segments.push({ type: "text", content: match[0] });
      }
    } else if (match[3] !== undefined) {
      // **bold**
      segments.push({ type: "bold", content: match[4] ?? "" });
    } else if (match[5] !== undefined) {
      // *italic*
      segments.push({ type: "italic", content: match[6] ?? "" });
    } else if (match[7] !== undefined) {
      // ~~strikethrough~~
      segments.push({ type: "strikethrough", content: match[7] });
    } else if (match[8] !== undefined) {
      // `code`
      segments.push({ type: "code", content: match[8] });
    } else if (match[9] !== undefined) {
      // [text](url)
      const url = match[10] ?? "";
      if (isSafeUrl(url)) {
        segments.push({ type: "link", content: match[9], url });
      } else {
        // Render as plain text if URL is not safe
        segments.push({ type: "text", content: match[0] });
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last match
  if (lastIndex < line.length) {
    segments.push({ type: "text", content: line.slice(lastIndex) });
  }

  return segments;
}

function renderSegment(
  segment: Segment,
  key: string,
  onMentionClick?: (userId: string) => void,
): ReactNode {
  switch (segment.type) {
    case "mention":
      return (
        <button
          key={key}
          type="button"
          onClick={() => segment.userId && onMentionClick?.(segment.userId)}
          className="font-semibold underline decoration-1 underline-offset-2 hover:opacity-80 focus:outline-none"
        >
          @{segment.content}
        </button>
      );
    case "bold":
      return <strong key={key}>{segment.content}</strong>;
    case "italic":
      return <em key={key}>{segment.content}</em>;
    case "strikethrough":
      return <s key={key}>{segment.content}</s>;
    case "code":
      return (
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
          {segment.content}
        </code>
      );
    case "link":
      return (
        <a
          key={key}
          href={segment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-primary hover:text-primary/80"
        >
          {segment.content}
        </a>
      );
    default:
      return <span key={key}>{segment.content}</span>;
  }
}

interface RichTextRendererProps {
  content: string;
  className?: string;
}

/**
 * RichTextRenderer — renders a Markdown subset to React elements.
 *
 * Supported syntax:
 * - `@[Name](mention:userId)` → <button> navigating to member profile
 * - `**bold**` → <strong>
 * - `*italic*` → <em>
 * - `~~strikethrough~~` → <s>
 * - `` `inline code` `` → <code>
 * - `[text](url)` → <a> (http/https only)
 * - ` ```code blocks``` ` → <pre><code>
 *
 * XSS-safe: no dangerouslySetInnerHTML, URLs validated to http/https,
 * mention userIds validated as UUID format.
 */
export function RichTextRenderer({ content, className }: RichTextRendererProps) {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) ?? "en";

  const handleMentionClick = (userId: string) => {
    router.push(`/members/${userId}` as Parameters<typeof router.push>[0]);
  };

  const lines = content.split("\n");
  const nodes: ReactNode[] = [];

  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let blockKey = 0;

  void locale; // locale available for future use

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        // End code block
        nodes.push(
          <pre
            key={`code-block-${blockKey++}`}
            className="my-1 overflow-x-auto rounded bg-muted p-2 font-mono text-xs"
          >
            <code>{codeBlockLines.join("\n")}</code>
          </pre>,
        );
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeBlockLines = [];
      }
    } else if (inCodeBlock) {
      codeBlockLines.push(line);
    } else {
      const segments = parseLine(line);
      const lineNodes = segments.map((seg, segIdx) =>
        renderSegment(seg, `seg-${i}-${segIdx}`, handleMentionClick),
      );

      if (i < lines.length - 1) {
        nodes.push(
          <span key={`line-${i}`}>
            {lineNodes}
            <br />
          </span>,
        );
      } else {
        nodes.push(<span key={`line-${i}`}>{lineNodes}</span>);
      }
    }
  }

  // Unclosed code block — render as-is
  if (inCodeBlock && codeBlockLines.length > 0) {
    nodes.push(
      <pre
        key={`code-block-${blockKey++}`}
        className="my-1 overflow-x-auto rounded bg-muted p-2 font-mono text-xs"
      >
        <code>{codeBlockLines.join("\n")}</code>
      </pre>,
    );
  }

  return <span className={className}>{nodes}</span>;
}
