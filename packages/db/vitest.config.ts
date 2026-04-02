import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: [
      // server-only is a no-op in tests
      {
        find: "server-only",
        replacement: path.resolve(__dirname, "src/test/mocks/server-only.ts"),
      },
      // @igbo/config resolves to source (no build step in tests)
      {
        find: "@igbo/config",
        replacement: path.resolve(__dirname, "../../packages/config/src"),
      },
      {
        find: "@igbo/config/env",
        replacement: path.resolve(__dirname, "../../packages/config/src/env"),
      },
      {
        find: "@igbo/config/notifications",
        replacement: path.resolve(__dirname, "../../packages/config/src/notifications"),
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
        find: "@igbo/config/chat",
        replacement: path.resolve(__dirname, "../../packages/config/src/chat"),
      },
      {
        find: "@igbo/config/redis",
        replacement: path.resolve(__dirname, "../../packages/config/src/redis"),
      },
      {
        find: "@igbo/config/realtime",
        replacement: path.resolve(__dirname, "../../packages/config/src/realtime"),
      },
      {
        find: "@igbo/config/upload",
        replacement: path.resolve(__dirname, "../../packages/config/src/upload"),
      },
    ],
  },
});
