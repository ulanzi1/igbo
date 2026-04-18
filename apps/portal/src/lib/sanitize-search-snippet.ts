/**
 * Client-safe HTML sanitizer for ts_headline output.
 *
 * This helper is intentionally isomorphic (no `import "server-only"`) so it can be
 * used inside client components. The existing `sanitize.ts` carries `server-only` and
 * cannot be imported into the client bundle.
 *
 * Security guarantee: PostgreSQL's ts_headline with hardcoded StartSel=<mark>/StopSel=</mark>
 * produces output where all HTML special characters are entity-escaped by PostgreSQL EXCEPT
 * for the <mark> and </mark> wrappers we inject. We therefore:
 *   1. HTML-escape ALL angle-bracket sequences.
 *   2. Un-escape the four exact entity sequences that correspond to our allowed tags.
 *
 * This is NOT a general-purpose sanitizer. It is intentionally narrow and bundle-thin
 * (~0.5 KB) — do NOT add sanitize-html as a dependency for this use case.
 *
 * See also: P-4.1B AC #9, Story Readiness Checklist §Sanitization Points.
 */

/**
 * Sanitizes a PostgreSQL ts_headline snippet so it is safe for `dangerouslySetInnerHTML`.
 *
 * Allow-list: only lowercase `<mark>` and `</mark>` are preserved; all other HTML is escaped.
 *
 * @param raw - The raw ts_headline output from the API. Must be a string.
 * @returns   A string safe for `dangerouslySetInnerHTML` with only `<mark>` allowed.
 */
export function sanitizeSearchSnippet(raw: string | null | undefined): string {
  // Defensive: type system enforces string, but guard at runtime too.
  if (raw == null) return "";
  if (typeof raw !== "string") return "";

  // Pass 1: escape ALL angle-bracket sequences to HTML entities.
  // This turns <mark> → &lt;mark&gt;, <script> → &lt;script&gt;, etc.
  const escaped = raw.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Pass 2: un-escape the two exact mark-tag entity sequences (case-sensitive).
  // ts_headline emits lowercase <mark>/<mark> per the StartSel/StopSel options.
  // We do NOT un-escape <MARK> or other variants — case-sensitivity is intentional.
  return escaped.replace(/&lt;mark&gt;/g, "<mark>").replace(/&lt;\/mark&gt;/g, "</mark>");
}
