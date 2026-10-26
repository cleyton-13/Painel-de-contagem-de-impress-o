import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefatos compilados e binarios
    "dist/**",
    "dist-seed/**",
    "agent-go/**",
    "Ferramentas/**",
    // Scripts utilitarios e servidores standalone (CommonJS / Node)
    "server.js",
    "scripts/**",
    "test-db.js",
  ]),
]);

export default eslintConfig;
