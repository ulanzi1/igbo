import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
        replacement: path.resolve(__dirname, "src/test-utils/server-only.ts"),
      },
      // @igbo/config — regex aliases cover all subpaths without enumeration
      {
        find: /^@igbo\/config\/(.+)$/,
        replacement: path.resolve(__dirname, "../../packages/config/src/$1"),
      },
      {
        find: /^@igbo\/config$/,
        replacement: path.resolve(__dirname, "../../packages/config/src/index"),
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
      // @igbo/auth self-reference for intra-package imports
      {
        find: /^@igbo\/auth\/(.+)$/,
        replacement: path.resolve(__dirname, "src/$1"),
      },
      {
        find: /^@igbo\/auth$/,
        replacement: path.resolve(__dirname, "src/index"),
      },
    ],
  },
});
