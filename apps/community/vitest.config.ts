import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/test/**", "src/**/*.test.{ts,tsx}", "src/env.ts"],
    },
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
        find: "@igbo/config/notifications",
        replacement: path.resolve(__dirname, "../../packages/config/src/notifications"),
      },
      {
        find: "@igbo/config/chat",
        replacement: path.resolve(__dirname, "../../packages/config/src/chat"),
      },
      {
        find: "@igbo/config/feed",
        replacement: path.resolve(__dirname, "../../packages/config/src/feed"),
      },
      {
        find: "@igbo/config/points",
        replacement: path.resolve(__dirname, "../../packages/config/src/points"),
      },
      {
        find: "@igbo/config/realtime",
        replacement: path.resolve(__dirname, "../../packages/config/src/realtime"),
      },
      {
        find: "@igbo/config/upload",
        replacement: path.resolve(__dirname, "../../packages/config/src/upload"),
      },
      // @igbo/db — regex aliases cover all 80+ subpaths without enumeration
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
