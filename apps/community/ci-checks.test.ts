// @vitest-environment node
/**
 * Unit tests for the composable CI checks scanners (scripts/ci-checks/).
 * Lives here (apps/community/*.test.ts) so vitest picks it up via the include glob.
 * This is the SINGLE authoritative test surface for ALL scanners (F8 fix — no co-located
 * scripts/ci-checks/check-*.test.ts files that would be missed by the vitest config).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { scanForStaleImports } from "../../scripts/ci-checks/check-stale-imports";
import { scanDirectProcessEnv } from "../../scripts/ci-checks/check-process-env";
import { scanMissingServerOnly } from "../../scripts/ci-checks/check-server-only";
import { scanHardcodedJsxStrings } from "../../scripts/ci-checks/check-hardcoded-jsx-strings";
import { scanUnsanitizedHtml } from "../../scripts/ci-checks/check-unsanitized-html";
import { generateAllowlistRegistry, run } from "../../scripts/ci-checks/index";
import {
  scanNextLinkImports,
  KNOWN_VIOLATIONS,
} from "../../scripts/ci-checks/check-next-link-import";
import { scanRealtimeServerOnly } from "../../scripts/ci-checks/check-realtime-server-only";
import { scanForRawRedisKeys } from "../../scripts/ci-checks/check-redis-keys";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "ci-checks-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function createFile(relPath: string, content: string) {
  const full = join(tmpDir, relPath);
  mkdirSync(full.substring(0, full.lastIndexOf("/")), { recursive: true });
  writeFileSync(full, content, "utf-8");
}

// ─── Stale import scanner ─────────────────────────────────────────────────────

describe("scanForStaleImports", () => {
  it("finds stale @/db/ import in a source file under apps/", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `import { db } from "@/db/index";\nexport const x = 1;`,
    );
    const results = scanForStaleImports(tmpDir);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].file).toContain("apps/community");
    expect(results[0].match).toContain("@/db/");
    expect(results[0].check).toBe("stale-import");
  });

  it("finds stale @/auth/ import in a test file under apps/", () => {
    createFile(
      "apps/community/src/auth.test.ts",
      `import { auth } from "@/auth/index";\nexport {};`,
    );
    const results = scanForStaleImports(tmpDir);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].match).toContain("@/auth/");
  });

  it("ignores @/db/ in packages/db/ (intra-package alias)", () => {
    createFile(
      "packages/db/src/queries/users.ts",
      `import { schema } from "@/db/schema";\nexport const x = 1;`,
    );
    const results = scanForStaleImports(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("ignores @/auth/ in packages/auth/ (intra-package alias)", () => {
    createFile(
      "packages/auth/src/session.ts",
      `import { auth } from "@/auth/config";\nexport const x = 1;`,
    );
    const results = scanForStaleImports(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("returns empty array when no stale imports found", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `import { db } from "@igbo/db";\nexport const x = 1;`,
    );
    const results = scanForStaleImports(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("detects stale vi.mock(@/db) patterns", () => {
    createFile("apps/community/src/my.test.ts", `vi.mock("@/db/index");\nexport {};`);
    const results = scanForStaleImports(tmpDir);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].match).toContain('vi.mock("@/db');
  });

  it("skips ci-checks.test.ts (own test fixtures)", () => {
    createFile("apps/community/ci-checks.test.ts", `import { db } from "@/db/index";\nexport {};`);
    const results = scanForStaleImports(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("does not flag @igbo/db imports (correct path)", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `import { db } from "@igbo/db/queries";\nexport const x = 1;`,
    );
    const results = scanForStaleImports(tmpDir);
    expect(results).toHaveLength(0);
  });
});

// ─── process.env scanner ──────────────────────────────────────────────────────

describe("scanDirectProcessEnv", () => {
  it("flags process.env.SECRET in a service file", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `import "server-only";\nconst secret = process.env.SECRET;\nexport {};`,
    );
    const results = scanDirectProcessEnv(tmpDir);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].check).toBe("process-env");
    expect(results[0].match).toContain("process.env.SECRET");
  });

  it("allows process.env.SECRET in a test file (Tier 1 path exempt)", () => {
    createFile(
      "apps/community/src/services/my-service.test.ts",
      `const secret = process.env.SECRET;\nexport {};`,
    );
    const results = scanDirectProcessEnv(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("allows process.env.SECRET in env.ts (Tier 1 path exempt)", () => {
    createFile("apps/community/src/env.ts", `const secret = process.env.SECRET;\nexport {};`);
    const results = scanDirectProcessEnv(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("allows process.env.NEXT_PUBLIC_FOO in any file (Tier 2 content exempt)", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `import "server-only";\nconst url = process.env.NEXT_PUBLIC_FOO;\nexport {};`,
    );
    const results = scanDirectProcessEnv(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("allows process.env.NODE_ENV in any file (Tier 2 content exempt)", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `import "server-only";\nif (process.env.NODE_ENV === "production") {}\nexport {};`,
    );
    const results = scanDirectProcessEnv(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("allows process.env.SECRET with // ci-allow-process-env (Tier 3 suppress)", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `import "server-only";\nconst secret = process.env.SECRET; // ci-allow-process-env\nexport {};`,
    );
    const results = scanDirectProcessEnv(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("allows all process.env in packages/ (Tier 1 path exempt)", () => {
    createFile("packages/db/src/index.ts", `const url = process.env.DATABASE_URL;\nexport {};`);
    const results = scanDirectProcessEnv(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("allows process.env in scripts/ directories (Tier 1 path exempt)", () => {
    createFile(
      "apps/community/scripts/seed.ts",
      `const url = process.env.DATABASE_URL;\nexport {};`,
    );
    const results = scanDirectProcessEnv(tmpDir);
    expect(results).toHaveLength(0);
  });
});

// ─── server-only scanner ──────────────────────────────────────────────────────

describe("scanMissingServerOnly", () => {
  it("flags service file without import 'server-only'", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `import { db } from "@igbo/db";\nexport {};`,
    );
    const results = scanMissingServerOnly(tmpDir);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].check).toBe("server-only");
    expect(results[0].match).toContain('missing import "server-only"');
  });

  it("passes service file with import 'server-only'", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `import "server-only";\nimport { db } from "@igbo/db";\nexport {};`,
    );
    const results = scanMissingServerOnly(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("skips test files in service directory", () => {
    createFile(
      "apps/community/src/services/my-service.test.ts",
      `import { db } from "@igbo/db";\nexport {};`,
    );
    const results = scanMissingServerOnly(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("skips files under realtime/ in server directory", () => {
    createFile(
      "apps/community/src/server/realtime/socket.ts",
      `import { Server } from "socket.io";\nexport {};`,
    );
    const results = scanMissingServerOnly(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("skips index.ts barrel exports in service directory", () => {
    createFile(
      "apps/community/src/services/index.ts",
      `export { myService } from "./my-service";\n`,
    );
    const results = scanMissingServerOnly(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("skips file with // ci-allow-no-server-only in first 5 lines", () => {
    createFile(
      "apps/community/src/services/event-bus.ts",
      `// ci-allow-no-server-only — shared with standalone\nimport { EventEmitter } from "events";\nexport {};`,
    );
    const results = scanMissingServerOnly(tmpDir);
    expect(results).toHaveLength(0);
  });
});

// ─── Hardcoded JSX strings scanner ───────────────────────────────────────────

describe("scanHardcodedJsxStrings", () => {
  // Guards against: regression in file filtering or false-positive-free baseline

  it("reports violation for hardcoded text node and placeholder attribute", () => {
    // Guards against: text-node and attribute detection being accidentally disabled
    createFile(
      "apps/portal/src/components/Button.tsx",
      `export function Button() {
  return (
    <div>
      <button>Click me</button>
      <input placeholder="Enter your name" />
    </div>
  );
}`,
    );
    const results = scanHardcodedJsxStrings(tmpDir);
    expect(results.some((r) => r.match.includes("Click me"))).toBe(true);
    expect(results.some((r) => r.match.includes("Enter your name"))).toBe(true);
    expect(results.every((r) => r.check === "hardcoded-jsx-string")).toBe(true);
  });

  it("F1: multiline text node — dotall regex catches text split across lines", () => {
    // Guards against: regression in dotall flag or multiline text-node detection (F1)
    createFile(
      "apps/portal/src/components/Welcome.tsx",
      `export function Welcome() {
  return (
    <p>
      Welcome to the portal,
      please sign in.
    </p>
  );
}`,
    );
    const results = scanHardcodedJsxStrings(tmpDir);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.match.includes("Welcome to the portal"))).toBe(true);
  });

  it("compliant: i18n calls and dynamic props produce zero violations", () => {
    // Guards against: false positives on properly translated or dynamic content
    createFile(
      "apps/portal/src/components/Compliant.tsx",
      `export function Compliant() {
  return (
    <div>
      <button>{t("click")}</button>
      <input placeholder={t("name")} />
      <div className="text-sm" />
      <img src="..." alt={t("img.alt")} />
    </div>
  );
}`,
    );
    const results = scanHardcodedJsxStrings(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("F7: word-boundary i18n suppression — start() does NOT suppress Login text node", () => {
    // Guards against: substring match on t( inside start( suppressing real violations (F7)
    // The OLD regex matched t( as substring of start( — a false negative.
    // The word-boundary regex \bt\s*\( does NOT match t inside 'start'.
    createFile(
      "apps/portal/src/components/LoginButton.tsx",
      `export function LoginButton() {
  return (
    <button onClick={() => start(evt)}>Login here please</button>
  );
}`,
    );
    const results = scanHardcodedJsxStrings(tmpDir);
    // "Login here please" has spaces → should be reported despite start() in handler
    expect(results.some((r) => r.match.includes("Login here please"))).toBe(true);
  });

  it("F13: both quote styles detected for user-facing attributes", () => {
    // Guards against: attribute detection only working with one quote style (F13)
    createFile(
      "apps/portal/src/components/Attrs.tsx",
      `export function Attrs() {
  return (
    <div>
      <img title='Single quoted title text' />
      <img title="Double quoted title text" />
    </div>
  );
}`,
    );
    const results = scanHardcodedJsxStrings(tmpDir);
    expect(results.some((r) => r.match.includes("Single quoted title text"))).toBe(true);
    expect(results.some((r) => r.match.includes("Double quoted title text"))).toBe(true);
  });

  it("F21: excluded attribute names never match", () => {
    // Guards against: accidental expansion of attribute regex to non-user-facing attrs (F21)
    // These attribute names are user-facing-irrelevant and MUST NEVER match.
    createFile(
      "apps/portal/src/components/Excluded.tsx",
      `export function Excluded() {
  return (
    <form>
      <input className="bg-red-500 w-full" id="main-content" role="button"
             type="text" name="username" key="form-key"
             href="/some-path" src="/some-image.png"
             htmlFor="the-label" data-testid="submit-button"
             aria-describedby="hint-text" data-long-attribute="some long value here" />
    </form>
  );
}`,
    );
    const results = scanHardcodedJsxStrings(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("comment stripping — comments are not flagged, real text IS flagged", () => {
    // Guards against: JSX expression comments or line comments being scanned (F2/F7 class)
    createFile(
      "apps/portal/src/components/Comments.tsx",
      `export function Comments() {
  return (
    <div>
      {/* Hardcoded comment text that looks like JSX */}
      <button>Real user text here</button>
    </div>
  );
  // const msg = "Click me here";
}`,
    );
    const results = scanHardcodedJsxStrings(tmpDir);
    // Only the real text node should be flagged, not the comments
    expect(results.some((r) => r.match.includes("Real user text here"))).toBe(true);
    expect(results.every((r) => !r.match.includes("Hardcoded comment text"))).toBe(true);
    expect(results.every((r) => !r.match.includes("Click me here"))).toBe(true);
  });

  it("allowlist comment on same line suppresses the match", () => {
    // Guards against: ci-allow-literal-jsx being ignored when on same line
    createFile(
      "apps/portal/src/components/AllowSameLine.tsx",
      `export function Allow() {
  return <button>Click me now</button>; // ci-allow-literal-jsx
}`,
    );
    const results = scanHardcodedJsxStrings(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("allowlist comment on immediately-preceding line suppresses the match", () => {
    // Guards against: ci-allow-literal-jsx being ignored when on preceding line
    createFile(
      "apps/portal/src/components/AllowPreceding.tsx",
      `export function Allow() {
  return (
    // ci-allow-literal-jsx
    <button>Submit the form</button>
  );
}`,
    );
    const results = scanHardcodedJsxStrings(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("test files are skipped — violations inside *.test.tsx are not reported", () => {
    // Guards against: scanner flagging its own test fixtures or other test files
    createFile(
      "apps/portal/src/components/MyComponent.test.tsx",
      `describe("test", () => {
  it("renders", () => {
    render(<button>Click here to submit the form</button>);
  });
});`,
    );
    const results = scanHardcodedJsxStrings(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("all i18n escape hatches suppress element-scoped text-node detection", () => {
    // Guards against: i18n escape hatch not working for specific function names (F7)
    const fixtures: Array<{ name: string; content: string }> = [
      {
        name: "UseTranslations.tsx",
        content: `export function A() {
  const t = useTranslations("ns");
  return <div><button>{t("k")}</button>Some text here</div>;
}`,
      },
      {
        name: "Trans.tsx",
        content: `export function B() {
  return <p><Trans i18nKey="k" />Some long text here</p>;
}`,
      },
      {
        name: "UseFormatter.tsx",
        content: `export function C() {
  const fmt = useFormatter();
  return <span>{fmt.dateTime(d)}Some text here</span>;
}`,
      },
      {
        name: "FormatMessage.tsx",
        content: `export function D() {
  return <p>{formatMessage({id:"k"})}Some text here</p>;
}`,
      },
      {
        name: "IntlFormat.tsx",
        content: `export function E() {
  return <p>{intl.formatMessage({id:"k"})}Some text here</p>;
}`,
      },
    ];
    for (const { name, content } of fixtures) {
      createFile(`apps/portal/src/components/${name}`, content);
    }
    // These elements have both literal text AND i18n call in the element — suppressed
    // (documented acceptable false negative per spec Decision 2)
    const results = scanHardcodedJsxStrings(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("empty tmpdir returns exactly [] — not null, not undefined, not throw", () => {
    // Guards against: scanner throwing or returning non-array on empty input
    expect(scanHardcodedJsxStrings(tmpDir)).toEqual([]);
  });

  it("tmpdir with only .ts and .json files returns []", () => {
    // Guards against: scanner accidentally scanning non-.tsx files
    createFile(
      "apps/portal/src/services/my-service.ts",
      `export const msg = "Click me here some long text";`,
    );
    createFile("apps/portal/messages/en.json", `{"key": "Click me here some long text"}`);
    const results = scanHardcodedJsxStrings(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("F14: mutation-style regression — scanner is not a no-op (violation tests fail if scanner returns [])", () => {
    // Guards against: scanner implementation being stripped to return [] (Lesson 2 proof)
    createFile(
      "apps/portal/src/components/Real.tsx",
      `export function Real() {
  return <p>Welcome to the portal, please sign in.</p>;
}`,
    );
    const results = scanHardcodedJsxStrings(tmpDir);
    // If scanner returned [] (phantom enforcement), this assertion would FAIL
    expect(results.length).toBeGreaterThan(0);
  });
});

// ─── Unsanitized HTML scanner ─────────────────────────────────────────────────

describe("scanUnsanitizedHtml", () => {
  it("reports violation for bare __html variable reference", () => {
    // Guards against: basic detection being disabled
    createFile(
      "apps/portal/src/components/Unsafe.tsx",
      `export function Unsafe({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}`,
    );
    const results = scanUnsanitizedHtml(tmpDir);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].check).toBe("unsanitized-html");
  });

  it("Lesson 2 bare-identifier: sanitizeHtml without parens is a violation", () => {
    // Guards against: scanner accepting bare references to sanitizeHtml without call parens
    // /^sanitizeHtml\s*\(/ requires the open paren — this MUST report.
    createFile(
      "apps/portal/src/components/BareRef.tsx",
      `export function BareRef({ sanitizeHtml }: any) {
  return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml }} />;
}`,
    );
    const results = scanUnsanitizedHtml(tmpDir);
    expect(results.some((r) => r.check === "unsanitized-html")).toBe(true);
  });

  it("F2 bypass: short-circuit || still starts with wrong expression", () => {
    // Guards against: scanner accepting maybeSafe(x) || sanitizeHtml("") bypass (F2)
    // Expression CONTAINS sanitizeHtml( but does NOT START with it.
    createFile(
      "apps/portal/src/components/ShortCircuit.tsx",
      `export function SC({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: maybeSafe(html) || sanitizeHtml("") }} />;
}`,
    );
    const results = scanUnsanitizedHtml(tmpDir);
    expect(results.some((r) => r.check === "unsanitized-html")).toBe(true);
  });

  it("F2 bypass: ternary starting with condition is a violation", () => {
    // Guards against: scanner accepting cond ? sanitizeHtml(a) : raw ternary (F2)
    // Expression starts with 'cond', not 'sanitizeHtml'.
    // Documented fix: wrap the whole ternary → sanitizeHtml(cond ? a : b)
    createFile(
      "apps/portal/src/components/Ternary.tsx",
      `export function Ternary({ cond, a, raw }: any) {
  return <div dangerouslySetInnerHTML={{ __html: cond ? sanitizeHtml(a) : raw }} />;
}`,
    );
    const results = scanUnsanitizedHtml(tmpDir);
    expect(results.some((r) => r.check === "unsanitized-html")).toBe(true);
  });

  it("F2 bypass: comment hiding sanitizeHtml in stripped source still flagged", () => {
    // Guards against: comment containing sanitizeHtml( suppressing the scan (F2 case 2)
    // After comment stripping, the expression clearly does not start with sanitizeHtml(.
    createFile(
      "apps/portal/src/components/CommentHide.tsx",
      `export function CommentHide({ raw }: { raw: string }) {
  return <div dangerouslySetInnerHTML={{ /* sanitizeHtml(raw) */ __html: raw }} />;
}`,
    );
    const results = scanUnsanitizedHtml(tmpDir);
    expect(results.some((r) => r.check === "unsanitized-html")).toBe(true);
  });

  it("F16 fail-closed: malformed nested expression with string-escaped brace", () => {
    // Guards against: scanner silently passing malformed expressions (F16)
    // Result MUST be either a violation or unsanitized-html-extraction-failed — never [].
    createFile(
      "apps/portal/src/components/NestedBrace.tsx",
      `export function Nested({ html }: any) {
  return <div dangerouslySetInnerHTML={{ __html: foo({bar: "}", baz: sanitizeHtml(html)}) }} />;
}`,
    );
    const results = scanUnsanitizedHtml(tmpDir);
    // Must report something — either violation or extraction failure, never silent zero
    expect(results.length).toBeGreaterThan(0);
  });

  it("F16 fail-closed: EOF before closing brace emits extraction-failed", () => {
    // Guards against: scanner silently dropping truncated expressions (F16)
    createFile(
      "apps/portal/src/components/Truncated.tsx",
      // Deliberately truncated — no closing }}
      `export function Truncated({ html }: any) {
  return <div dangerouslySetInnerHTML={{ __html: foo(`,
    );
    const results = scanUnsanitizedHtml(tmpDir);
    expect(results.some((r) => r.check === "unsanitized-html-extraction-failed")).toBe(true);
  });

  it("compliant: direct sanitizeHtml() call produces zero violations", () => {
    // Guards against: false positive on the correct usage pattern
    createFile(
      "apps/portal/src/components/Safe.tsx",
      `import { sanitizeHtml } from "@/lib/sanitize";
export function Safe({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}`,
    );
    const results = scanUnsanitizedHtml(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("compliant: ternary correctly wrapped in sanitizeHtml() outer call", () => {
    // Guards against: false positive on the documented correct workaround for Sub 5.4
    createFile(
      "apps/portal/src/components/SafeTernary.tsx",
      `import { sanitizeHtml } from "@/lib/sanitize";
export function SafeTernary({ cond, a, b }: any) {
  return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(cond ? a : b) }} />;
}`,
    );
    const results = scanUnsanitizedHtml(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("compliant: whitespace between sanitizeHtml and ( is still valid", () => {
    // Guards against: overly strict regex that requires no space before (
    createFile(
      "apps/portal/src/components/SafeSpace.tsx",
      `import { sanitizeHtml } from "@/lib/sanitize";
export function SafeSpace({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml  (html) }} />;
}`,
    );
    const results = scanUnsanitizedHtml(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("compliant: chained method call starting with sanitizeHtml()", () => {
    // Guards against: false positive on sanitizeHtml(html).trim() (starts with sanitizeHtml()
    createFile(
      "apps/portal/src/components/SafeChained.tsx",
      `import { sanitizeHtml } from "@/lib/sanitize";
export function SafeChained({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(html).trim() }} />;
}`,
    );
    const results = scanUnsanitizedHtml(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("allowlist 1 line above suppresses", () => {
    // Guards against: allowlist comment at 1 line above not working
    createFile(
      "apps/portal/src/components/Allow1.tsx",
      `export function Allow({ html }: { html: string }) {
  // ci-allow-unsanitized-html — pre-sanitized server-side
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}`,
    );
    expect(scanUnsanitizedHtml(tmpDir)).toHaveLength(0);
  });

  it("allowlist 2 lines above suppresses", () => {
    // Guards against: allowlist comment at 2 lines above not working
    createFile(
      "apps/portal/src/components/Allow2.tsx",
      `export function Allow({ html }: { html: string }) {
  // ci-allow-unsanitized-html — pre-sanitized server-side

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}`,
    );
    expect(scanUnsanitizedHtml(tmpDir)).toHaveLength(0);
  });

  it("allowlist 3 lines above suppresses", () => {
    // Guards against: allowlist comment at 3 lines above not working
    createFile(
      "apps/portal/src/components/Allow3.tsx",
      `export function Allow({ html }: { html: string }) {
  // ci-allow-unsanitized-html — pre-sanitized server-side


  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}`,
    );
    expect(scanUnsanitizedHtml(tmpDir)).toHaveLength(0);
  });

  it("F23 boundary: allowlist 4 lines above does NOT suppress", () => {
    // Guards against: allowlist window being too generous (F23)
    createFile(
      "apps/portal/src/components/Allow4.tsx",
      `export function Allow({ html }: { html: string }) {
  // ci-allow-unsanitized-html — pre-sanitized server-side



  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}`,
    );
    const results = scanUnsanitizedHtml(tmpDir);
    expect(results.some((r) => r.check === "unsanitized-html")).toBe(true);
  });

  it("multi-violation file reports two results", () => {
    // Guards against: scanner stopping after first violation
    createFile(
      "apps/portal/src/components/Multi.tsx",
      `export function Multi({ a, b }: { a: string; b: string }) {
  return (
    <div>
      <div dangerouslySetInnerHTML={{ __html: a }} />
      <div dangerouslySetInnerHTML={{ __html: b }} />
    </div>
  );
}`,
    );
    const results = scanUnsanitizedHtml(tmpDir);
    expect(results.filter((r) => r.check === "unsanitized-html")).toHaveLength(2);
  });

  it("test files (*.test.tsx) are skipped", () => {
    // Guards against: scanner flagging test fixtures
    createFile(
      "apps/portal/src/components/Foo.test.tsx",
      `it("test", () => {
  render(<div dangerouslySetInnerHTML={{ __html: rawHtml }} />);
});`,
    );
    expect(scanUnsanitizedHtml(tmpDir)).toHaveLength(0);
  });

  it("VD-5: scanner is source-agnostic — both community and portal sanitizeHtml accepted", () => {
    // Guards against: scanner being tied to one app's sanitize.ts (VD-5)
    createFile(
      "apps/community/src/components/FromCommunity.tsx",
      `import { sanitizeHtml } from "@igbo/community/lib/sanitize";
export function A({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}`,
    );
    createFile(
      "apps/portal/src/components/FromPortal.tsx",
      `import { sanitizeHtml } from "@igbo/portal/lib/sanitize";
export function B({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}`,
    );
    expect(scanUnsanitizedHtml(tmpDir)).toHaveLength(0);
  });

  it("empty tmpdir returns exactly [] — not null, not undefined, not throw", () => {
    // Guards against: scanner throwing on empty input
    expect(scanUnsanitizedHtml(tmpDir)).toEqual([]);
  });

  it("tmpdir with only .ts files returns []", () => {
    // Guards against: scanner accidentally scanning non-.tsx files
    createFile("apps/portal/src/services/my.ts", `export const html = "<div>" + raw + "</div>";`);
    expect(scanUnsanitizedHtml(tmpDir)).toHaveLength(0);
  });

  it("F14: mutation-style regression — scanner is not a no-op", () => {
    // Guards against: scanner implementation being stripped to return [] (Lesson 2 proof)
    createFile(
      "apps/portal/src/components/Proof.tsx",
      `export function Proof({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}`,
    );
    const results = scanUnsanitizedHtml(tmpDir);
    expect(results.length).toBeGreaterThan(0);
  });
});

// ─── Allowlist registry drift ─────────────────────────────────────────────────

describe("allowlist registry drift", () => {
  it("reports allowlist-registry-drift when on-disk file is stale (Sub 7.7)", () => {
    // Guards against: allowlist drift check itself being phantom enforcement (Lesson 2)
    createFile(
      "apps/portal/src/components/AllowListed.tsx",
      `export function A({ html }: { html: string }) {
  // pre-sanitized server-side
  // ci-allow-unsanitized-html
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}`,
    );
    // Write a stale registry that is missing this new entry
    createFile("docs/ci-check-allowlist.md", "# CI Check Allowlist Registry\n\nStale content.\n");

    const { violations } = generateAllowlistRegistry(tmpDir);
    expect(violations.some((r) => r.check === "allowlist-registry-drift")).toBe(true);
  });

  it("returns no drift violation when registry matches generated content", () => {
    // Guards against: false positive when registry is up-to-date
    // Generate the correct registry first, write it to disk, then re-check
    const { content } = generateAllowlistRegistry(tmpDir);
    createFile("docs/ci-check-allowlist.md", content);
    const { violations } = generateAllowlistRegistry(tmpDir);
    expect(violations.filter((r) => r.check === "allowlist-registry-drift")).toHaveLength(0);
  });
});

// ─── next/link import scanner ──────────────────────────────────────────────────

describe("scanNextLinkImports", () => {
  it("detects `import Link from 'next/link'` in portal src", () => {
    createFile(
      "apps/portal/src/components/MyLink.tsx",
      `import Link from "next/link";\nexport default function MyLink() { return <Link href="/">Home</Link>; }`,
    );
    const results = scanNextLinkImports(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].check).toBe("next-link-import");
    expect(results[0].file).toBe("apps/portal/src/components/MyLink.tsx");
  });

  it("detects `import { default as Link } from 'next/link'`", () => {
    createFile(
      "apps/portal/src/components/AliasLink.tsx",
      `import { default as Link } from "next/link";\nexport default function A() { return <Link href="/">X</Link>; }`,
    );
    const results = scanNextLinkImports(tmpDir);
    expect(results).toHaveLength(1);
  });

  it("ignores `import { Link } from '@/i18n/navigation'`", () => {
    createFile(
      "apps/portal/src/components/Good.tsx",
      `import { Link } from "@/i18n/navigation";\nexport default function G() { return <Link href="/">OK</Link>; }`,
    );
    const results = scanNextLinkImports(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("respects `// ci-allow-next-link-import` opt-out on preceding line", () => {
    createFile(
      "apps/portal/src/components/Allowed.tsx",
      `// ci-allow-next-link-import\nimport Link from "next/link";\nexport default function A() { return <Link href="/">X</Link>; }`,
    );
    const results = scanNextLinkImports(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("scopes to portal only — community file with next/link is not flagged", () => {
    createFile(
      "apps/community/src/components/CommunityLink.tsx",
      `import Link from "next/link";\nexport default function A() { return <Link href="/">X</Link>; }`,
    );
    const results = scanNextLinkImports(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("returns result for file at a KNOWN_VIOLATIONS path", () => {
    const knownPath = KNOWN_VIOLATIONS[0]!;
    createFile(knownPath, `import Link from "next/link";\nexport {};`);
    const results = scanNextLinkImports(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].file).toBe(knownPath);
  });

  it("returns result for file NOT in KNOWN_VIOLATIONS", () => {
    createFile(
      "apps/portal/src/components/brand-new.tsx",
      `import Link from "next/link";\nexport {};`,
    );
    const results = scanNextLinkImports(tmpDir);
    expect(results).toHaveLength(1);
  });

  it("skips `import type { Link } from 'next/link'`", () => {
    createFile(
      "apps/portal/src/components/TypeOnly.tsx",
      `import type { Link } from "next/link";\nexport {};`,
    );
    const results = scanNextLinkImports(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("known-violation file with opt-out comment returns no result", () => {
    const knownPath = KNOWN_VIOLATIONS[0]!;
    createFile(
      knownPath,
      `// ci-allow-next-link-import\nimport Link from "next/link";\nexport {};`,
    );
    const results = scanNextLinkImports(tmpDir);
    expect(results).toHaveLength(0);
  });
});

describe("scanNextLinkImports — run() integration", () => {
  it("new violations are hard failures, known violations are warnings", async () => {
    // Create a known-violation file
    const knownPath = KNOWN_VIOLATIONS[0]!;
    createFile(knownPath, `import Link from "next/link";\nexport {};`);
    // Create a new-violation file (NOT in KNOWN_VIOLATIONS)
    createFile(
      "apps/portal/src/components/new-violation.tsx",
      `import Link from "next/link";\nexport {};`,
    );

    // Mock process.cwd to use tmpDir
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    // Mock process.exit to prevent killing the test runner
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });
    // Capture console output
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Mock all other scanners to return [] — isolate to next-link-import only
    const staleModule = await import("../../scripts/ci-checks/check-stale-imports");
    const envModule = await import("../../scripts/ci-checks/check-process-env");
    const serverOnlyModule = await import("../../scripts/ci-checks/check-server-only");
    const jsxModule = await import("../../scripts/ci-checks/check-hardcoded-jsx-strings");
    const htmlModule = await import("../../scripts/ci-checks/check-unsanitized-html");
    const indexModule = await import("../../scripts/ci-checks/index");

    vi.spyOn(staleModule, "scanForStaleImports").mockReturnValue([]);
    vi.spyOn(envModule, "scanDirectProcessEnv").mockReturnValue([]);
    vi.spyOn(serverOnlyModule, "scanMissingServerOnly").mockReturnValue([]);
    vi.spyOn(jsxModule, "scanHardcodedJsxStrings").mockReturnValue([]);
    vi.spyOn(htmlModule, "scanUnsanitizedHtml").mockReturnValue([]);
    vi.spyOn(indexModule, "generateAllowlistRegistry").mockReturnValue({
      content: "",
      violations: [],
    });

    try {
      run();
    } catch (e: unknown) {
      expect((e as Error).message).toBe("exit:1");
    }

    // Verify: new violation appears in console.error
    const errorOutput = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(errorOutput).toContain("new-violation.tsx");

    // Verify: known violation appears in console.warn
    const warnOutput = warnSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(warnOutput).toContain("next-link-import (known)");

    cwdSpy.mockRestore();
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });
});

// ─── Realtime server-only import guard ────────────────────────────────────────

describe("scanRealtimeServerOnly", () => {
  it("returns empty when entry point does not exist", () => {
    // Guards against: scanner throwing when realtime dir is absent (e.g., test tmpdir)
    const results = scanRealtimeServerOnly(tmpDir);
    expect(results).toEqual([]);
  });

  it("returns empty when entry point has no server-only in graph", () => {
    // Guards against: false positive on clean import graph
    createFile(
      "apps/community/src/server/realtime/index.ts",
      `import { setup } from "./namespaces/chat";\nexport {};`,
    );
    createFile(
      "apps/community/src/server/realtime/namespaces/chat.ts",
      `import Redis from "ioredis";\nexport function setup() {}`,
    );
    const results = scanRealtimeServerOnly(tmpDir);
    expect(results).toEqual([]);
  });

  it("detects direct import of server-only from entry point", () => {
    // Guards against: scanner missing direct server-only import
    createFile(
      "apps/community/src/server/realtime/index.ts",
      `import "server-only";\nimport { Server } from "socket.io";\nexport {};`,
    );
    const results = scanRealtimeServerOnly(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].check).toBe("realtime-server-only");
    expect(results[0].file).toContain("realtime/index.ts");
    expect(results[0].match).toContain('imports "server-only"');
  });

  it("detects transitive server-only via relative import", () => {
    // Guards against: scanner not following relative imports
    createFile(
      "apps/community/src/server/realtime/index.ts",
      `import { auth } from "./middleware/auth";\nexport {};`,
    );
    createFile(
      "apps/community/src/server/realtime/middleware/auth.ts",
      `import { helper } from "./helper";\nexport function auth() {}`,
    );
    createFile(
      "apps/community/src/server/realtime/middleware/helper.ts",
      `import "server-only";\nexport function helper() {}`,
    );
    const results = scanRealtimeServerOnly(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].file).toContain("helper.ts");
    expect(results[0].match).toContain("→");
  });

  it("detects transitive server-only via @igbo/db package import", () => {
    // Guards against: scanner not resolving @igbo/* workspace packages
    createFile(
      "apps/community/src/server/realtime/index.ts",
      `import { getUser } from "@igbo/db/queries/auth-queries";\nexport {};`,
    );
    createFile(
      "packages/db/src/queries/auth-queries.ts",
      `import "server-only";\nexport function getUser() {}`,
    );
    const results = scanRealtimeServerOnly(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].file).toContain("packages/db/src/queries/auth-queries.ts");
  });

  it("detects transitive server-only via @igbo/config package import", () => {
    // Guards against: scanner not resolving @igbo/config subpath
    createFile(
      "apps/community/src/server/realtime/index.ts",
      `import { FOO } from "@igbo/config/realtime";\nexport {};`,
    );
    createFile("packages/config/src/realtime.ts", `import "server-only";\nexport const FOO = 1;`);
    const results = scanRealtimeServerOnly(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].file).toContain("packages/config/src/realtime.ts");
  });

  it("detects transitive server-only via @/ path alias", () => {
    // Guards against: scanner not resolving @/ alias to community/src
    createFile(
      "apps/community/src/server/realtime/index.ts",
      `import type { Foo } from "@/types/events";\nimport { bar } from "@/lib/utils";\nexport {};`,
    );
    createFile("apps/community/src/types/events.ts", `export type Foo = string;`);
    createFile(
      "apps/community/src/lib/utils.ts",
      `import "server-only";\nexport function bar() {}`,
    );
    const results = scanRealtimeServerOnly(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].file).toContain("lib/utils.ts");
  });

  it("skips type-only imports (import type has no runtime effect)", () => {
    // Guards against: false positive on import type from server-only module
    createFile(
      "apps/community/src/server/realtime/index.ts",
      `import type { Foo } from "./foo";\nexport {};`,
    );
    createFile(
      "apps/community/src/server/realtime/foo.ts",
      `import "server-only";\nexport type Foo = string;`,
    );
    const results = scanRealtimeServerOnly(tmpDir);
    expect(results).toEqual([]);
  });

  it("reports multiple violations in the graph", () => {
    // Guards against: scanner stopping after first violation
    createFile(
      "apps/community/src/server/realtime/index.ts",
      `import { a } from "./module-a";\nimport { b } from "./module-b";\nexport {};`,
    );
    createFile(
      "apps/community/src/server/realtime/module-a.ts",
      `import "server-only";\nexport const a = 1;`,
    );
    createFile(
      "apps/community/src/server/realtime/module-b.ts",
      `import "server-only";\nexport const b = 2;`,
    );
    const results = scanRealtimeServerOnly(tmpDir);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.check === "realtime-server-only")).toBe(true);
  });

  it("handles circular imports without infinite loop", () => {
    // Guards against: infinite loop on circular dependencies
    createFile(
      "apps/community/src/server/realtime/index.ts",
      `import { a } from "./circular-a";\nexport {};`,
    );
    createFile(
      "apps/community/src/server/realtime/circular-a.ts",
      `import { b } from "./circular-b";\nexport const a = 1;`,
    );
    createFile(
      "apps/community/src/server/realtime/circular-b.ts",
      `import { a } from "./circular-a";\nexport const b = 2;`,
    );
    const results = scanRealtimeServerOnly(tmpDir);
    expect(results).toEqual([]);
  });

  it("import chain includes full path from entry to violation", () => {
    // Guards against: chain being empty or incomplete
    createFile(
      "apps/community/src/server/realtime/index.ts",
      `import { setup } from "./namespaces/portal";\nexport {};`,
    );
    createFile(
      "apps/community/src/server/realtime/namespaces/portal.ts",
      `import { query } from "@igbo/db/queries/bad-query";\nexport function setup() {}`,
    );
    createFile(
      "packages/db/src/queries/bad-query.ts",
      `import "server-only";\nexport function query() {}`,
    );
    const results = scanRealtimeServerOnly(tmpDir);
    expect(results).toHaveLength(1);
    const chain = results[0].match;
    expect(chain).toContain("realtime/index.ts");
    expect(chain).toContain("namespaces/portal.ts");
    expect(chain).toContain("bad-query.ts");
  });

  it("excludes @igbo/db barrel from traversal (Drizzle schema registration pattern)", () => {
    // Guards against: false positive on @igbo/db barrel which imports all schemas
    // The db barrel is a Drizzle ORM requirement — all schemas registered via `import *`.
    // Traversal is skipped, but the barrel ITSELF is still checked for server-only.
    createFile(
      "apps/community/src/server/realtime/index.ts",
      `import { db } from "@igbo/db";\nexport {};`,
    );
    // Barrel file imports a schema with server-only (like the real codebase)
    createFile(
      "packages/db/src/index.ts",
      `import * as portalSchema from "./schema/portal-job-postings";\nexport const db = {};`,
    );
    createFile(
      "packages/db/src/schema/portal-job-postings.ts",
      `import "server-only";\nexport const table = {};`,
    );
    const results = scanRealtimeServerOnly(tmpDir);
    // Barrel traversal is excluded — schema file not reached
    expect(results).toEqual([]);
  });

  it("still detects server-only in the @igbo/db barrel itself", () => {
    // Guards against: exclusion hiding server-only IN the barrel file
    createFile(
      "apps/community/src/server/realtime/index.ts",
      `import { db } from "@igbo/db";\nexport {};`,
    );
    createFile("packages/db/src/index.ts", `import "server-only";\nexport const db = {};`);
    const results = scanRealtimeServerOnly(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].file).toBe("packages/db/src/index.ts");
  });

  it("still detects server-only in @igbo/db subpath imports (not excluded)", () => {
    // Guards against: exclusion being too broad — subpath imports MUST be checked
    createFile(
      "apps/community/src/server/realtime/index.ts",
      `import { getUser } from "@igbo/db/queries/portal-applications";\nexport {};`,
    );
    createFile(
      "packages/db/src/queries/portal-applications.ts",
      `import "server-only";\nexport function getUser() {}`,
    );
    const results = scanRealtimeServerOnly(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].file).toContain("portal-applications.ts");
  });

  it("ignores external npm packages (no false positive on ioredis, socket.io, etc.)", () => {
    // Guards against: scanner crashing or false-positive on unresolvable npm imports
    createFile(
      "apps/community/src/server/realtime/index.ts",
      `import { Server } from "socket.io";\nimport Redis from "ioredis";\nimport { createServer } from "node:http";\nexport {};`,
    );
    const results = scanRealtimeServerOnly(tmpDir);
    expect(results).toEqual([]);
  });
});

// ─── Redis key scanner ────────────────────────────────────────────────────────

describe("scanForRawRedisKeys", () => {
  it("returns empty when no files exist", () => {
    const results = scanForRawRedisKeys(tmpDir);
    expect(results).toEqual([]);
  });

  it("detects template literal Redis key with colon separators", () => {
    createFile(
      "apps/portal/src/services/my-service.ts",
      `const key = \`dedup:portal:\${id}\`;\nredis.set(key, "1");`,
    );
    const results = scanForRawRedisKeys(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0]!.check).toBe("redis-key");
    expect(results[0]!.file).toContain("my-service.ts");
  });

  it("detects string literal passed to Redis method call", () => {
    createFile("apps/portal/src/services/my-service.ts", `await redis.get("portal:session:abc");`);
    const results = scanForRawRedisKeys(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0]!.check).toBe("redis-key");
  });

  it("detects constant assignment with Redis key pattern", () => {
    createFile("apps/portal/src/services/my-service.ts", `const DEDUP_KEY = "dedup:portal:notif";`);
    const results = scanForRawRedisKeys(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0]!.check).toBe("redis-key");
  });

  it("exempts lines using createRedisKey()", () => {
    createFile(
      "apps/portal/src/services/my-service.ts",
      `const key = createRedisKey("portal", "dedup", \`notif:\${id}\`);`,
    );
    const results = scanForRawRedisKeys(tmpDir);
    expect(results).toEqual([]);
  });

  it("exempts lines with ci-allow-redis-key marker", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `const key = \`lockout:\${userId}\`; // ci-allow-redis-key — community scope`,
    );
    const results = scanForRawRedisKeys(tmpDir);
    expect(results).toEqual([]);
  });

  it("exempts test files", () => {
    createFile(
      "apps/portal/src/services/my-service.test.ts",
      `const key = \`dedup:portal:\${id}\`;`,
    );
    const results = scanForRawRedisKeys(tmpDir);
    expect(results).toEqual([]);
  });

  it("exempts packages/config/src/redis.ts itself", () => {
    createFile("packages/config/src/redis.ts", `return \`\${app}:\${domain}:\${id}\`;`);
    const results = scanForRawRedisKeys(tmpDir);
    expect(results).toEqual([]);
  });

  it("exempts cache-registry.ts generic operations", () => {
    createFile(
      "apps/portal/src/lib/cache-registry.ts",
      `await redis.get(key);\nawait redis.set(key, value);`,
    );
    const results = scanForRawRedisKeys(tmpDir);
    expect(results).toEqual([]);
  });

  it("exempts registerCacheNamespace SCAN patterns", () => {
    createFile(
      "apps/portal/src/services/job-search-service.ts",
      `registerCacheNamespace("job-search", ["portal:job-search:*"]);`,
    );
    const results = scanForRawRedisKeys(tmpDir);
    expect(results).toEqual([]);
  });

  it("exempts pub/sub channel patterns (eventbus:)", () => {
    createFile(
      "apps/portal/src/services/event-bus.ts",
      "publisher.publish(`eventbus:${event}`, JSON.stringify(payload));",
    );
    const results = scanForRawRedisKeys(tmpDir);
    expect(results).toEqual([]);
  });

  it("detects multiple violations in a single file", () => {
    createFile(
      "apps/portal/src/services/bad-service.ts",
      `const k1 = \`dedup:portal:a:\${id}\`;\nconst k2 = \`dedup:portal:b:\${id}\`;\nconst k3 = \`throttle:portal:\${id}\`;`,
    );
    const results = scanForRawRedisKeys(tmpDir);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.check === "redis-key")).toBe(true);
  });

  it("detects violations in packages/ (not just apps/)", () => {
    createFile("packages/auth/src/config.ts", `const key = \`challenge:\${sessionId}\`;`);
    const results = scanForRawRedisKeys(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0]!.file).toContain("packages/auth");
  });
});

// ─── Integration canary ───────────────────────────────────────────────────────

describe("integration canary — real codebase", () => {
  const ROOT = resolve(__dirname, "../..");

  it("all eight scanners report zero violations against current codebase", () => {
    // next-link-import: filter out known violations (they are warnings, not failures)
    const knownSet = new Set(KNOWN_VIOLATIONS);
    const nextLinkNew = scanNextLinkImports(ROOT).filter((r) => !knownSet.has(r.file));

    const results = [
      ...scanForStaleImports(ROOT),
      ...scanDirectProcessEnv(ROOT),
      ...scanMissingServerOnly(ROOT),
      ...scanHardcodedJsxStrings(ROOT),
      ...scanUnsanitizedHtml(ROOT),
      ...nextLinkNew,
      ...scanRealtimeServerOnly(ROOT),
      ...scanForRawRedisKeys(ROOT),
    ];
    expect(
      results,
      `CI checks found ${results.length} violation(s). Run: npx tsx scripts/ci-checks/index.ts`,
    ).toEqual([]);
  });
});
