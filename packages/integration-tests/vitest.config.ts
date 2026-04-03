import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.ts"],
    // Integration tests require running apps — skip in CI unless explicitly opted in
    // Run with: pnpm --filter @igbo/integration-tests test:integration
  },
  resolve: {
    alias: [
      {
        find: "server-only",
        replacement: path.resolve(__dirname, "../../apps/community/src/test/mocks/server-only.ts"),
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
