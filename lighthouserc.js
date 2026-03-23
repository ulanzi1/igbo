/** @type {import('@lhci/utils/src/types').LhciConfig} */
module.exports = {
  ci: {
    collect: {
      // Scan the landing page (ISR) and the login page (SSR)
      url: ["http://localhost:3000/en", "http://localhost:3000/en/login"],
      numberOfRuns: 1,
    },
    assert: {
      assertions: {
        // Core Web Vitals — using INP (Interaction to Next Paint, replaces deprecated FID in Lighthouse 10+)
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "experimental-interaction-to-next-paint": [
          "error",
          { maxNumericValue: 200 },
        ],
        // Category score budgets
        "categories:performance": ["error", { minScore: 0.75 }],
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
