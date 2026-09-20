import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    // .mjs avoids MODULE_TYPELESS_PACKAGE_JSON reparse overhead (no package.json "type").
    ignores: [
      ".next/**",
      "node_modules/**",
      "scripts/**",
      "supabase/**",
      "data/**",
      "skills/**",
      "agent/**",
      // Local AI-agent skill mirrors (dotdirs) — not app code
      ".*/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "prettier"),
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
