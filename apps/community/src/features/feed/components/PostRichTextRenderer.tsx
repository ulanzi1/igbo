"use client";

import { useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";

interface PostRichTextRendererProps {
  content: string; // Stringified Tiptap JSON
}

// TODO(perf): Each instance creates a full Tiptap/ProseMirror editor.
// For feeds with many rich_text posts, consider a lightweight renderer
// that converts Tiptap JSON → React elements without editor overhead.
export function PostRichTextRenderer({ content }: PostRichTextRendererProps) {
  // Parse BEFORE useEditor to avoid conditional hook call.
  // useMemo ensures stable reference across renders.
  const parsedContent = useMemo(() => {
    try {
      return JSON.parse(content) as object;
    } catch {
      return null;
    }
  }, [content]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, TiptapLink.configure({ openOnClick: false })],
    content: parsedContent ?? undefined,
    editable: false,
    editorProps: {
      attributes: {
        class: "text-sm leading-relaxed prose prose-sm max-w-none",
      },
    },
  });

  // Fallback: render as plain text if JSON was invalid
  if (!parsedContent) {
    return <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{content}</div>;
  }

  return <EditorContent editor={editor} />;
}
