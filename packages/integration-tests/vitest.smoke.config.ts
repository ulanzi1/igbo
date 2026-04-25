import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Vitest config for the cross-container smoke test (AI-27).
 * Separate from vitest.config.ts so the smoke test can be run without
 * being blocked by the exclude in the default config.
 *
 * Run with:
 *   REDIS_URL=redis://localhost:6379 pnpm --filter @igbo/integration-tests test:smoke
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/portal-cross-container-smoke.test.ts"],
  },
  resolve: {
    alias: [
      {
        find: "server-only",
        replacement: path.resolve(
          __dirname,
          "../../apps/community/src/test/mocks/server-only.ts",
        ),
      },
      {
        find: /^@igbo\/config\/(.+)$/,
        replacement: path.resolve(__dirname, "../../packages/config/src/$1"),
      },
      {
        find: /^@igbo\/config$/,
        replacement: path.resolve(__dirname, "../../packages/config/src"),
      },
      {
        find: /^@igbo\/db\/(.+)$/,
        replacement: path.resolve(__dirname, "../../packages/db/src/$1"),
      },
      {
        find: /^@igbo\/db$/,
        replacement: path.resolve(__dirname, "../../packages/db/src/index"),
      },
      {
        find: /^@igbo\/auth\/(.+)$/,
        replacement: path.resolve(__dirname, "../../packages/auth/src/$1"),
      },
      {
        find: /^@igbo\/auth$/,
        replacement: path.resolve(__dirname, "../../packages/auth/src/index"),
      },
    ],
  },
});
