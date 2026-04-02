/**
 * Shared test utility factories for common vi.mock() patterns.
 *
 * These factories are called inside consumers' own `vi.hoisted()` blocks
 * where `vi` is already in scope — do NOT import from "vitest" here.
 *
 * See also: `test-utils.tsx` for React render helpers.
 */

/**
 * Factory for the mutable socket context pattern (established in ChatWindow tests).
 *
 * Usage:
 * ```ts
 * const ctx = vi.hoisted(() => makeSocketContext());
 * vi.mock("@/providers/SocketProvider", () => ({
 *   useSocketContext: () => ctx,
 * }));
 * beforeEach(() => {
 *   ctx.chatSocket = null;
 *   ctx.notificationsSocket = null;
 *   ctx.isConnected = false;
 * });
 * ```
 *
 * WARNING: vi.clearAllMocks() resets spy call counts but does NOT reset property
 * mutations on plain objects. Always reset fields manually in beforeEach.
 */
export function makeSocketContext() {
  return {
    chatSocket: null as unknown,
    notificationsSocket: null as unknown,
    isConnected: false,
  };
}

/**
 * Factory for the EventBus handler-capture pattern (established in notification-service tests).
 *
 * Usage:
 * ```ts
 * const { handlerRef, captureHandler } = vi.hoisted(() => makeHandlerRegistry());
 * vi.mock("@/services/event-bus", () => ({
 *   eventBus: { on: vi.fn(captureHandler), emit: vi.fn() },
 * }));
 * // In test: await handlerRef.current.get("event.name")!(payload);
 * ```
 *
 * The Map is shared by reference across test cases. Module-level handlers registered
 * at import time persist across tests — this is intentional and matches production behaviour.
 */
export function makeHandlerRegistry() {
  const handlerRef = { current: new Map<string, (...args: unknown[]) => unknown>() };

  function captureHandler(event: string, handler: (...args: unknown[]) => unknown) {
    handlerRef.current.set(event, handler);
  }

  return { handlerRef, captureHandler };
}

/**
 * ⚠️ CRITICAL: Use mockReset() — NOT clearAllMocks() — when your beforeEach contains
 * mockResolvedValueOnce / mockRejectedValueOnce sequences.
 *
 * Root cause: `vi.clearAllMocks()` clears call history and spy implementations BUT
 * does NOT clear the `Once` return queue. Leftover Once values from a test that
 * returns early bleed into subsequent tests with NO warning — they silently return
 * the wrong value, producing inexplicable assertion failures.
 *
 * `vi.resetAllMocks()` / `mockFn.mockReset()` clears BOTH call history AND the Once queue.
 *
 * Rule: If you queue Once values in beforeEach (or at describe scope), use mockReset().
 * If you only set up Once values inside individual test cases, clearAllMocks() is safe.
 *
 * Usage:
 * ```ts
 * const mockFetchUser = vi.fn();
 *
 * // ✅ CORRECT — mockReset clears the Once queue so each test starts clean
 * beforeEach(() => {
 *   mockFetchUser.mockReset();
 *   mockFetchUser.mockResolvedValueOnce({ id: "1", name: "Ada" }); // set up fresh
 * });
 *
 * // ❌ WRONG — clearAllMocks() leaves leftover Once values if an early test returns
 * beforeEach(() => {
 *   vi.clearAllMocks();
 *   mockFetchUser.mockResolvedValueOnce({ id: "1", name: "Ada" }); // may bleed!
 * });
 * ```
 *
 * This bug caused test failures in both Story 3.2 and Story 3.3. Do not repeat.
 */

/**
 * Call at the start of any test that uses React Query data + `waitFor`.
 *
 * Root cause: RTL's `waitFor` polls via `setInterval`. With `vi.useFakeTimers()` active,
 * `setInterval` is frozen and `waitFor` hangs indefinitely. Additionally, React Query's
 * async `queryFn` is NOT tracked by `act()` — advancing fake timers inside `act` fires
 * fetch but React Query's state update may not be applied yet.
 *
 * This helper switches the current test to real timers so `waitFor` polls normally.
 * It only affects the calling test; sibling tests retain whatever timer mode is active.
 *
 * Usage:
 * ```ts
 * it("renders fetched data", async () => {
 *   useRealTimersForReactQuery();
 *   render(<MyComponent />);
 *   await waitFor(() => expect(screen.getByText("result")).toBeInTheDocument());
 * });
 * ```
 */
export function useRealTimersForReactQuery() {
  // `vi` is a global in Vitest test files — no import needed here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).vi?.useRealTimers();
}

/**
 * ⚠️ Dialog mock-to-null pattern for jsdom tests.
 *
 * Root cause: CSS media queries (e.g., `md:hidden`) do NOT apply in jsdom. When a component
 * renders both a desktop inline form AND a mobile Dialog, both are present in the DOM
 * simultaneously, causing duplicate `data-testid` or duplicate element errors.
 *
 * Fix: Mock Dialog (and its sub-components) to return null in test files for components
 * that use responsive desktop/mobile rendering patterns.
 *
 * Usage (in the test file for the component):
 * ```ts
 * vi.mock("@/components/ui/dialog", () => ({
 *   Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
 *   DialogContent: () => null,
 *   DialogHeader: () => null,
 *   DialogTitle: () => null,
 *   DialogDescription: () => null,
 *   DialogFooter: () => null,
 *   DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
 * }));
 * ```
 *
 * This was rediscovered in Stories 4.2, 4.3, and 4.4. Do NOT mock Dialog as a passthrough
 * — mock DialogContent (and other content components) to return null so only one rendering
 * path is active in jsdom.
 */

/**
 * ✅ Route test mock pattern — NEVER mock withApiHandler as passthrough.
 *
 * Root cause: `vi.mock("@/server/api/middleware", () => ({ withApiHandler: handler => handler }))`
 * strips the try/catch that converts `ApiError` to HTTP responses. Tests expecting 4xx status
 * codes instead receive 200 because the ApiError thrown in the handler propagates unhandled.
 *
 * Correct pattern — mock the DEPENDENCIES that withApiHandler checks, not withApiHandler itself:
 * ```ts
 * vi.mock("@/lib/rate-limiter", () => ({
 *   checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, resetAt: 0 }),
 *   buildRateLimitHeaders: vi.fn().mockReturnValue({}),
 * }));
 * vi.mock("@/lib/request-context", () => ({
 *   runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
 * }));
 * ```
 *
 * The real `withApiHandler` then catches `ApiError` thrown inside the route and returns the
 * correct HTTP status code. This pattern was established in Story 4.3.
 *
 * ❌ WRONG (strips error handling):
 * ```ts
 * vi.mock("@/server/api/middleware", () => ({
 *   withApiHandler: (handler: unknown) => handler,
 * }));
 * ```
 */

/**
 * ✅ vi.hoisted() for DB mock objects — avoid temporal dead zone (TDZ) errors.
 *
 * Root cause: `vi.mock()` is hoisted to the top of the file by Vitest. If the factory
 * function references a `const` declared AFTER the `vi.mock()` call, you get a TDZ
 * ReferenceError at runtime because the variable is not yet initialised when the
 * factory executes.
 *
 * Fix: Declare DB mock objects (and any mock functions they reference) inside `vi.hoisted()`.
 * `vi.hoisted()` runs BEFORE `vi.mock()` factories, so the objects are available.
 *
 * Usage:
 * ```ts
 * const mockDb = vi.hoisted(() => ({
 *   select: vi.fn(),
 *   insert: vi.fn(),
 *   update: vi.fn(),
 *   delete: vi.fn(),
 *   transaction: vi.fn(),
 * }));
 *
 * vi.mock("@igbo/db", () => ({ db: mockDb })); // ✅ safe — mockDb is already initialised
 * ```
 *
 * ❌ WRONG — TDZ error when factory runs before const is initialised:
 * ```ts
 * vi.mock("@igbo/db", () => ({ db: mockDb })); // ❌ mockDb not yet defined
 * const mockDb = { select: vi.fn() };
 * ```
 *
 * This pattern was required in Story 4.4 for `communityPostBookmarks` mock objects.
 */

/**
 * ✅ successResponse signature — status is the THIRD argument, not the second.
 *
 * Root cause: `successResponse(data, meta?, status=200)` — the second arg is metadata,
 * not status. Passing status as the second arg silently produces a 200 response instead
 * of the intended 201/202, with no runtime error.
 *
 * Rule: For non-200 responses use `successResponse({ x }, undefined, 201)`.
 * Never pass status as the second argument.
 *
 * ✅ CORRECT:
 * ```ts
 * return successResponse({ created: true }, undefined, 201);
 * return successResponse({ items }, { total: 10 }, 200); // explicit 200 with meta
 * ```
 *
 * ❌ WRONG — status silently ignored, response returns 200:
 * ```ts
 * return successResponse({ created: true }, 201); // ← 201 treated as `meta`, status defaults to 200
 * ```
 *
 * First hit: Story 5.3 route audit. Repeated in Story 5.4 ban error response.
 */

/**
 * ⚠️ eventbus-bridge @igbo/db/queries/* import cascade.
 *
 * Root cause: `src/server/realtime/eventbus-bridge.ts` imports query files at the top level.
 * Any new `import ... from "@igbo/db/queries/new-file"` in that bridge causes `@/db` to load,
 * which triggers env validation — breaking BOTH `eventbus-bridge.test.ts` AND
 * `notification-flow.test.ts` (the integration test that imports the bridge).
 *
 * Fix: Whenever you add a new `@/db/queries/*` import to the bridge, add a matching
 * `vi.mock()` to BOTH test files:
 *
 * ```ts
 * // In eventbus-bridge.test.ts AND notification-flow.test.ts:
 * vi.mock("@igbo/db/queries/new-file", () => ({
 *   newQueryFn: vi.fn().mockResolvedValue([]),
 * }));
 * ```
 *
 * Rule: Every new query file imported in the bridge requires a mock in both files.
 * Never bare-mock (`vi.mock("@igbo/db/queries/new-file")`) — always use an explicit factory.
 *
 * First hit: Story 5.3 group-channels import. Repeated in Story 5.4 groups import.
 */

/**
 * 🌍 i18n hardcoding — ZERO hardcoded English strings in UI components.
 *
 * Root cause: It is tempting to write inline strings like `"Join group"` or
 * `"You are muted"` directly in JSX or error responses. These bypass the translation
 * system and will always render in English regardless of the user's language preference.
 *
 * Rule: Every user-facing string MUST come from `useTranslations()` in React components
 * or an i18n key reference in server responses. Define keys in `messages/en.json` AND
 * `messages/ig.json` BEFORE writing the component.
 *
 * ✅ CORRECT — translated string:
 * ```tsx
 * const t = useTranslations("Groups");
 * <button>{t("joinGroup")}</button>
 * // messages/en.json: { "Groups": { "joinGroup": "Join group" } }
 * // messages/ig.json: { "Groups": { "joinGroup": "Sonye otu" } }
 * ```
 *
 * ❌ WRONG — hardcoded English string:
 * ```tsx
 * <button>Join group</button>
 * // Also wrong in error responses:
 * return errorResponse({ title: "You are muted", status: 403 });
 * ```
 *
 * Pre-review check: Search component files for literal English prose strings
 * in JSX and API responses before submitting for review.
 * First hit: Story 5.3 channel tab. Repeated in Story 5.4 ban response.
 */

/**
 * ✅ dangerouslySetInnerHTML safe-use — ALWAYS sanitize server-side first.
 *
 * Root cause: React's `dangerouslySetInnerHTML` renders HTML strings exactly as-is.
 * If that HTML contains user-generated content (article body, rich text, bios),
 * it creates an XSS vector — any `<script>` or event handler in the HTML executes.
 *
 * Rule: Any HTML string passed to `dangerouslySetInnerHTML` MUST be sanitized
 * with `sanitize-html` on the server BEFORE being sent to the client component.
 * The client component receives clean HTML and can safely render it.
 *
 * ✅ CORRECT — server component sanitizes first:
 * ```ts
 * import sanitizeHtml from "sanitize-html";
 *
 * // In Server Component (server-side):
 * const safeHtml = sanitizeHtml(rawHtmlFromTiptap, {
 *   allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h2", "h3", "img"]),
 *   allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img: ["src", "alt"] },
 * });
 *
 * // Pass safe HTML to client component:
 * return <ArticleLanguageToggle enContent={safeHtml} />;
 *
 * // In client component — safe because input was sanitized server-side:
 * <div dangerouslySetInnerHTML={{ __html: enContent }} />
 * ```
 *
 * ❌ WRONG — rendering raw user HTML without sanitization:
 * ```tsx
 * <div dangerouslySetInnerHTML={{ __html: article.contentHtml }} />
 * // article.contentHtml came directly from DB — NOT sanitized
 * ```
 *
 * Pre-review check: Search for `dangerouslySetInnerHTML` in all components and verify
 * the HTML source was sanitized with `sanitize-html` before reaching the client.
 *
 * First hit: Story 6.2 ArticlePreviewModal — unsanitized admin preview of user article HTML.
 * Canonical correct example: Story 6.3 article reading page — Server Component passes
 * sanitized HTML strings to `<ArticleLanguageToggle>`.
 */

/**
 * 🌐 Locale hardcoding — NEVER hardcode locale values ("en") in locale-dependent APIs.
 *
 * Root cause: Hardcoding `"en"` in `Intl.DateTimeFormat("en", ...)` (or any locale-dependent
 * API) bypasses the user's language preference and always renders dates/numbers/text
 * in English regardless of the active locale.
 *
 * Rule:
 * - **Client Components**: use `useLocale()` from `next-intl` to get the current locale.
 * - **Server Components**: receive `locale` from route params (Next.js App Router passes
 *   `{ params: { locale } }` to page/layout Server Components).
 * - **Shared utilities** (date formatters, etc.): accept `locale` as an explicit argument —
 *   never derive it internally by hardcoding.
 *
 * ✅ CORRECT — Client Component reads locale from next-intl:
 * ```tsx
 * import { useLocale } from "next-intl";
 *
 * function EventDate({ date }: { date: Date }) {
 *   const locale = useLocale();
 *   return <span>{new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date)}</span>;
 * }
 * ```
 *
 * ✅ CORRECT — Server Component receives locale from params:
 * ```tsx
 * export default function EventPage({ params }: { params: { locale: string; eventId: string } }) {
 *   const formatted = new Intl.DateTimeFormat(params.locale, { dateStyle: "long" }).format(date);
 *   return <span>{formatted}</span>;
 * }
 * ```
 *
 * ❌ WRONG — hardcoded locale:
 * ```tsx
 * // Always renders in English regardless of user's language preference
 * new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(date)
 * ```
 *
 * Pre-review check: Search component files for `Intl.DateTimeFormat("en"` (or other
 * hardcoded locale strings) before submitting for review.
 *
 * First hit: Epic 7 Stories 7.2 and 7.3 — hardcoded `"en"` in date formatting utilities.
 */

/**
 * ✅ Notification critical path resilience — any service in the notification critical path
 * calling external deps (DB, Redis) MUST have try/catch + fallback to defaults.
 *
 * Root cause: `NotificationRouter.route()` calls `getNotificationPreferences(userId)` which
 * hits the DB. If the DB is down or the query throws, the uncaught exception propagates
 * through the EventBus handler — which swallows exceptions silently. The user receives NO
 * notifications (complete blackout) rather than graceful degradation to default prefs.
 *
 * Rule: Any service in the notification critical path that calls an external dep must:
 * 1. Wrap the external call in try/catch
 * 2. Log a structured error JSON with `console.error`
 * 3. Fall back to safe defaults (e.g. empty prefs → DEFAULT_PREFERENCES govern all channels)
 * 4. Continue delivery — never re-throw from the router
 *
 * ✅ CORRECT — graceful degradation pattern in NotificationRouter:
 * ```ts
 * let prefs: Awaited<ReturnType<typeof getNotificationPreferences>>;
 * try {
 *   prefs = await getNotificationPreferences(userId);
 * } catch (err: unknown) {
 *   console.error(JSON.stringify({ level: "error", message: "notification_router.preferences_fetch_failed", userId, error: String(err) }));
 *   prefs = {}; // DEFAULT_PREFERENCES governs every channel fallback below
 * }
 * ```
 *
 * ❌ WRONG — uncaught DB error causes silent notification blackout:
 * ```ts
 * const prefs = await getNotificationPreferences(userId); // throws → EventBus swallows → no notifications
 * ```
 *
 * Test pattern: mock `getNotificationPreferences` to throw, assert `route()` resolves
 * with a valid RouteResult (inApp.suppressed === false for default-enabled types).
 *
 * First hit: Epic 9 retrospective — identified as critical path failure mode.
 * Fixed: Story 9.5 (NotificationRouter graceful degradation).
 */

/**
 * ✅ Additive permission audit — every new access path requires explicit regression tests.
 *
 * Root cause: When a new permission path is added (admin, creator, top-tier, etc.), existing
 * code branches may share logic but with slightly different guards. Dead-code conditions
 * (e.g. identical check on outer and inner guard) can silently make admin/creator paths
 * unreachable — the feature ships broken with no failing test to surface it.
 *
 * Rule: For EVERY new permission path added to a handler or service:
 * 1. Audit ALL code branches that gate that access level — outer conditions, inner conditions,
 *    early returns. Check for duplicate or shadowed guards.
 * 2. Write a NAMED regression test for each access path (e.g. "admin can preserve beyond
 *    retention limit", "creator can cancel own event", "top-tier sees download button").
 * 3. Write a corresponding negative test (e.g. "non-admin cannot preserve", "non-creator
 *    cannot cancel").
 *
 * ✅ CORRECT — named tests for each permission branch:
 * ```ts
 * it("admin can preserve recording beyond retention window", async () => { ... });
 * it("non-admin cannot preserve recording", async () => { ... });
 * it("creator can cancel own event", async () => { ... });
 * ```
 *
 * ❌ WRONG — single happy-path test only:
 * ```ts
 * it("returns 200 when preserving recording", async () => { ... });
 * // Admin-bypass dead-code goes undetected
 * ```
 *
 * Pre-review check: For each new `if (isAdmin)` / `if (userId === creatorId)` / tier-check
 * branch, verify a named regression test exists for THAT specific path.
 *
 * First hit: Story 5.4 ban bypass (missing regression for ban enforcement in createGroupPost).
 * Second hit: Story 7.4 preserveRecording — duplicate guard on outer/inner condition made
 * admin preservation dead code; no regression test caught it.
 */

/**
 * 🔗 next-intl router — `useRouter().push()` accepts strings only, NOT objects.
 *
 * Root cause: `useRouter()` from `next-intl` is NOT the standard Next.js router.
 * Passing a `{ pathname, query }` object to `.push()` results in navigation to
 * `[object Object]` — the URL is silently stringified.
 *
 * Rule: Always build a URL string before calling `router.push()` from `next-intl`.
 * Use `URLSearchParams` to construct query strings.
 *
 * ✅ CORRECT — build string with URLSearchParams:
 * ```ts
 * import { useRouter } from "next-intl/client";
 *
 * const router = useRouter();
 * const params = new URLSearchParams({ q: query, type: "posts" });
 * router.push(`/search?${params.toString()}`);
 * ```
 *
 * ❌ WRONG — object form silently navigates to `[object Object]`:
 * ```ts
 * router.push({ pathname: "/search", query: { q: query } });
 * ```
 *
 * First hit: Story 10.2 F5 — FilteredSearchResults `handleTypeChange` navigated to
 * `[object Object]` instead of `/search?type=posts`.
 */
