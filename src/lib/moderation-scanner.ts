/**
 * Pure content scanner — no DB or service imports.
 * Normalizes text and keyword with NFD decomposition + diacritical strip,
 * then tests whole-word boundary regex.
 *
 * Sort order: high → medium → low severity (highest severity match returned first).
 */

export interface Keyword {
  keyword: string;
  category: string;
  severity: "low" | "medium" | "high";
}

const SEVERITY_ORDER: Record<Keyword["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Normalize text for comparison:
 * 1. Lowercase
 * 2. NFD unicode decomposition (separates base chars from combining diacritics)
 * 3. Strip combining diacritical marks (U+0300–U+036F)
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Scan `text` against `keywords`. Returns the first (highest-severity) match or null.
 * Does NOT match keywords as substrings — uses whole-word boundaries (\b).
 */
export function scanContent(text: string, keywords: Keyword[]): Keyword | null {
  if (!text || keywords.length === 0) return null;

  const normalizedText = normalize(text);

  const sorted = [...keywords].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  for (const kw of sorted) {
    const normalizedKw = normalize(kw.keyword);
    if (!normalizedKw) continue;
    // Escape special regex chars in keyword before wrapping in \b
    const escaped = normalizedKw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`);
    if (regex.test(normalizedText)) {
      return kw;
    }
  }

  return null;
}
