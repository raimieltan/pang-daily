import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The game runtime talks to the UI only through src/game/bridge (TECH_ARCHITECTURE §5).
    files: ["src/game/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "react/*", "next", "next/*", "zustand", "zustand/*"],
              message: "Game runtime must stay UI-agnostic; emit a bridge event instead.",
            },
            {
              group: ["@/state/*", "@/components/*", "@/app/*"],
              message: "Game runtime must not reach into React; emit a bridge event instead.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
