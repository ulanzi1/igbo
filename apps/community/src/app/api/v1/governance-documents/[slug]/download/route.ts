import { withApiHandler } from "@/server/api/middleware";
import { ApiError } from "@/lib/api-error";
import { getDocumentBySlug } from "@/services/governance-document-service";
import { sanitizeHtml } from "@/lib/sanitize";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const GET = withApiHandler(async (request: Request) => {
  const parts = new URL(request.url).pathname.split("/");
  // URL pattern: /api/v1/governance-documents/[slug]/download
  // "download" is last, slug is second-to-last
  const slug = parts.at(-2)!;

  const doc = await getDocumentBySlug(slug);
  if (!doc || doc.status !== "published" || doc.visibility !== "public") {
    throw new ApiError({ title: "Not Found", status: 404 });
  }

  const url = new URL(request.url);
  const locale = url.searchParams.get("locale") ?? "en";
  const useIgbo = locale === "ig" && Boolean(doc.contentIgbo);
  const rawContent = useIgbo ? doc.contentIgbo! : doc.content;
  const content = sanitizeHtml(rawContent);
  const safeTitle = escapeHtml(doc.title);
  const langLabel = useIgbo ? "Igbo" : "English";

  const html = `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 0 24px; line-height: 1.7; color: #1a1a1a; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    .meta { color: #666; font-size: 0.875rem; margin-bottom: 2rem; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  <p class="meta">Version ${doc.version} &bull; Language: ${langLabel} &bull; Published: ${doc.publishedAt?.toLocaleDateString("en") ?? "—"}</p>
  ${content}
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.html"`,
      "Cache-Control": "no-store",
    },
  });
});
