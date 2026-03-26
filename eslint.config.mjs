import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import drizzle from "eslint-plugin-drizzle";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/sw.js",
    "tests/load/**",
    "scripts/**",
  ]),
  {
    plugins: {
      drizzle,
    },
    rules: {
      // No `any` type — type safety from day one
      "@typescript-eslint/no-explicit-any": "error",

      // No console.log — production needs structured logging
      "no-console": ["error", { allow: ["warn", "error", "info"] }],

      // Drizzle ORM enforcement — no inline SQL
      "drizzle/enforce-delete-with-where": "error",
      "drizzle/enforce-update-with-where": "error",

      // No useEffect + fetch — use React Query or server actions
      "react-hooks/exhaustive-deps": "warn",
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='useEffect'] CallExpression[callee.name='fetch']",
          message:
            "Do not use fetch() inside useEffect. Use React Query (useQuery) or server actions instead.",
        },
        // No hardcoded UI strings — bilingual support requires useTranslations() from next-intl
        {
          selector: "JSXElement > Literal[value=/\\S/]",
          message: "Hardcoded UI strings are not allowed. Use useTranslations() from next-intl.",
        },
      ],

      // No internal feature path imports — enforce barrel exports
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*/!(index)"],
              message: "Import from feature barrel exports (@/features/*/index) only.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
