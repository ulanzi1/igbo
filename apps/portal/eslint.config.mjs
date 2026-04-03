import tsEslint from "typescript-eslint";

const eslintConfig = tsEslint.config(
  { ignores: [".next/", "node_modules/"] },
  ...tsEslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["error", { allow: ["warn", "error", "info"] }],
      // Allow underscore-prefixed unused variables (conventional for intentionally unused params)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Relax certain rules in test files
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      // Mock factories often use synchronous require() for lazy loading to avoid circular deps
      "@typescript-eslint/no-require-imports": "off",
    },
  }
);

export default eslintConfig;
