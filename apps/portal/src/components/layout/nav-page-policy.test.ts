// @vitest-environment node

/**
 * CI enforcement for AI-21 "No nav link without a working page" policy.
 *
 * Reads layout nav components and role-switcher as text, extracts every
 * internal href, then asserts each resolves to a real page.tsx on disk —
 * accounting for Next.js route groups like (gated)/(ungated).
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, relative, join } from "node:path";

// ---------------------------------------------------------------------------
// 1. Build a Set of valid portal URL paths from page.tsx files on disk
// ---------------------------------------------------------------------------

const APP_DIR = resolve(__dirname, "../../app/[locale]");

/** Recursively find all page.tsx files under a directory. */
function findPages(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findPages(fullPath));
    } else if (entry.name === "page.tsx") {
      results.push(fullPath);
    }
  }
  return results;
}

function discoverValidPaths(): Set<string> {
  if (!existsSync(APP_DIR)) {
    throw new Error(`APP_DIR does not exist: ${APP_DIR}`);
  }

  const pages = findPages(APP_DIR);
  const paths = new Set<string>();

  for (const page of pages) {
    // Get path relative to APP_DIR, e.g. "(gated)/applications/page.tsx"
    let rel = relative(APP_DIR, page).split(/[\\/]/).join("/");
    // Remove trailing "/page.tsx" or bare "page.tsx"
    rel = rel.replace(/\/?page\.tsx$/, "");

    // Strip route groups — parenthesized directory segments like (gated), (ungated)
    rel = rel
      .split("/")
      .filter((seg) => seg !== "" && !seg.startsWith("("))
      .join("/");

    const urlPath = rel === "" ? "/" : `/${rel}`;
    paths.add(urlPath);
  }

  return paths;
}

// ---------------------------------------------------------------------------
// 2. Extract internal hrefs from source files
// ---------------------------------------------------------------------------

const NAV_DIR = resolve(__dirname);

/** All layout files that may contain internal nav links. */
const NAV_SOURCE_FILES = [
  "portal-top-nav.tsx",
  "portal-bottom-nav.tsx",
  "UserProfileDropdown.tsx",
  "NotificationBadge.tsx",
];

interface ExtractedHref {
  path: string;
  source: string;
}

function extractHrefsFromFile(filename: string): ExtractedHref[] {
  const filePath = resolve(NAV_DIR, filename);
  if (!existsSync(filePath)) {
    throw new Error(`Nav source file missing: ${filePath}`);
  }
  const source = readFileSync(filePath, "utf-8");
  const hrefs: ExtractedHref[] = [];

  // Pattern 1: Template literals with locale — `/${locale}/some-path` or `/${locale}`
  const templateRegex = /`\/\$\{locale\}(\/[^`]*)?`/g;
  let match: RegExpExecArray | null;
  while ((match = templateRegex.exec(source)) !== null) {
    const pathPart = match[1] ?? "";
    const cleanPath = pathPart === "" ? "/" : pathPart;
    hrefs.push({ path: cleanPath, source: filename });
  }

  // Pattern 2: next-intl <Link href="/path"> — plain string hrefs (locale auto-prefixed)
  const linkHrefRegex = /href="(\/[a-z][a-z0-9\-/]*)"/g;
  while ((match = linkHrefRegex.exec(source)) !== null) {
    hrefs.push({ path: match[1]!, source: filename });
  }

  return hrefs;
}

function extractRoleSwitcherRedirects(): ExtractedHref[] {
  const filePath = resolve(NAV_DIR, "role-switcher.tsx");
  if (!existsSync(filePath)) {
    throw new Error(`Role switcher file missing: ${filePath}`);
  }
  const source = readFileSync(filePath, "utf-8");
  const hrefs: ExtractedHref[] = [];

  // Find the ROLE_REDIRECT block and extract quoted path values
  const blockMatch = source.match(/ROLE_REDIRECT[^{]*\{([^}]+)\}/s);
  if (!blockMatch) {
    throw new Error("ROLE_REDIRECT block not found in role-switcher.tsx");
  }

  const valueRegex = /:\s*"(\/[^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = valueRegex.exec(blockMatch[1]!)) !== null) {
    hrefs.push({ path: match[1]!, source: "role-switcher.tsx" });
  }

  if (hrefs.length === 0) {
    throw new Error("ROLE_REDIRECT block found but no path values extracted");
  }

  return hrefs;
}

// ---------------------------------------------------------------------------
// 3. Tests
// ---------------------------------------------------------------------------

describe("AI-21 Placeholder Page Policy Enforcement", () => {
  const validPaths = discoverValidPaths();
  const allHrefs: ExtractedHref[] = [
    ...NAV_SOURCE_FILES.flatMap((f) => extractHrefsFromFile(f)),
    ...extractRoleSwitcherRedirects(),
  ];

  // Deduplicate by path (same path from different sources only needs one check)
  const uniqueHrefs = new Map<string, ExtractedHref>();
  for (const href of allHrefs) {
    if (!uniqueHrefs.has(href.path)) {
      uniqueHrefs.set(href.path, href);
    }
  }

  it("discovers at least one valid page path", () => {
    expect(validPaths.size).toBeGreaterThan(0);
  });

  it("extracts at least one nav href", () => {
    expect(uniqueHrefs.size).toBeGreaterThan(0);
  });

  it.each([...uniqueHrefs.entries()].map(([path, href]) => [path, href.source]))(
    "nav href %s (from %s) resolves to a real page",
    (path) => {
      expect(
        validPaths.has(path),
        `Orphan nav link: "${path}" has no matching page.tsx.\n` +
          `Valid paths: ${[...validPaths].sort().join(", ")}\n` +
          `Fix: either create the page or remove the nav link.`,
      ).toBe(true);
    },
  );
});
