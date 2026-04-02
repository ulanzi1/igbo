/** @type {import('@lhci/utils/src/types').LhciConfig} */
module.exports = {
  ci: {
    collect: {
      // ISR-safe pages only — these are pre-rendered into .next/static/ at build time
      // and served without a runtime DB query, so they work with the standalone server.
      // DO NOT add /en/members or /en/groups — those query the DB at request time.
      url: [
        "http://localhost:3000/en", // ISR — pre-rendered ✓
        "http://localhost:3000/en/login", // SSR form (no DB query) ✓
        "http://localhost:3000/en/articles", // ISR — pre-rendered ✓
        "http://localhost:3000/en/events", // ISR — pre-rendered ✓
        "http://localhost:3000/en/about", // ISR — governance doc pre-rendered ✓
      ],
      numberOfRuns: 1,
    },
    assert: {
      assertions: {
        // Core Web Vitals — CI runners are slow, so use relaxed perf thresholds.
        // LCP budget is generous for shared CI runners (cold start, no CDN).
        "largest-contentful-paint": ["warn", { maxNumericValue: 5000 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        // Category score budgets — performance is warn-only in CI
        "categories:performance": ["warn", { minScore: 0.5 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["error", { minScore: 0.9 }],
        "categories:seo": ["error", { minScore: 0.85 }],
      },
    },
    upload: {
      // Write reports to local filesystem; treosh/lighthouse-ci-action uploads as artifacts
      target: "filesystem",
      outputDir: ".lighthouseci",
    },
  },
};
