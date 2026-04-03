import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["@testing-library/jest-dom/vitest"],
    include: ["src/**/*.test.{ts,tsx}", "*.test.ts"],
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      // server-only throws outside Next.js server context; no-op in tests
      {
        find: "server-only",
        replacement: path.resolve(__dirname, "./src/test/mocks/server-only.ts"),
      },
      // @igbo/config individual aliases (source-level, no build step needed in tests)
      {
        find: "@igbo/config",
        replacement: path.resolve(__dirname, "../../packages/config/src"),
      },
      {
        find: "@igbo/config/env",
        replacement: path.resolve(__dirname, "../../packages/config/src/env"),
      },
      {
        find: "@igbo/config/redis",
        replacement: path.resolve(__dirname, "../../packages/config/src/redis"),
      },
      {
        find: "@igbo/config/events",
        replacement: path.resolve(__dirname, "../../packages/config/src/events"),
      },
      // @igbo/db — regex aliases cover all subpaths without enumeration
      {
        find: /^@igbo\/db\/(.+)$/,
        replacement: path.resolve(__dirname, "../../packages/db/src/$1"),
      },
      {
        find: /^@igbo\/db$/,
        replacement: path.resolve(__dirname, "../../packages/db/src/index"),
      },
      // @igbo/auth — regex aliases cover all subpaths without enumeration
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
