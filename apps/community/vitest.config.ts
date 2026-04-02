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
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // server-only throws outside Next.js server context; no-op in tests
      "server-only": path.resolve(__dirname, "./src/test/mocks/server-only.ts"),
      // Resolve @igbo/config to the package source (no build step needed in tests)
      "@igbo/config": path.resolve(__dirname, "../../packages/config/src"),
      "@igbo/config/env": path.resolve(__dirname, "../../packages/config/src/env"),
      "@igbo/config/redis": path.resolve(__dirname, "../../packages/config/src/redis"),
      "@igbo/config/notifications": path.resolve(
        __dirname,
        "../../packages/config/src/notifications",
      ),
      "@igbo/config/chat": path.resolve(__dirname, "../../packages/config/src/chat"),
      "@igbo/config/feed": path.resolve(__dirname, "../../packages/config/src/feed"),
      "@igbo/config/points": path.resolve(__dirname, "../../packages/config/src/points"),
      "@igbo/config/realtime": path.resolve(__dirname, "../../packages/config/src/realtime"),
      "@igbo/config/upload": path.resolve(__dirname, "../../packages/config/src/upload"),
    },
  },
});
