import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Original socket wrapper supplied as reference input. Its transport logic
    // was adapted into src/lib/ws/UnifiedWSClient.ts, which is the copy the
    // application uses; this file is kept only for provenance and is neither
    // imported nor linted.
    "socket.ts",
  ]),
]);

export default eslintConfig;
