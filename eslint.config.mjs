import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Design tokens only: text sizes, corner radii, page widths and colours come from the theme in
// src/app/globals.css, never one-off values. (Generated images under next/og are exempt.)
const OFF_SCALE = String.raw`(?:^|[\s"'\x60:])(?:text-\[[0-9.]+(?:px|rem)\]|rounded(?:-[a-z]{1,2})?-\[[0-9.]+px\]|max-w-\[[0-9]+px\]|[a-z:-]+-\[#[0-9a-fA-F]{3,8}\]|shadow-\[[^\]]+\])`;
const tokenMessage =
  "Use a design token (text-caption, rounded-card, max-w-reading, bg-waiting-tint, shadow-raised…) from src/app/globals.css instead of a one-off value.";
// Cards, row lists and empty notes are the surface utilities in globals.css, not hand-built.
const HAND_SURFACE = String.raw`rounded-card border border-line bg-surface`;
const surfaceMessage = "Use the surface, surface-list or surface-empty utility (src/app/globals.css) for cards and lists.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  {
    files: ["src/**/*.tsx", "src/**/*.ts"],
    ignores: ["src/**/opengraph-image.tsx", "src/app/icon.tsx", "src/app/apple-icon.tsx", "src/app/icons/**", "src/lib/brand-mark.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: `Literal[value=/${OFF_SCALE}/]`, message: tokenMessage },
        { selector: `TemplateElement[value.raw=/${OFF_SCALE}/]`, message: tokenMessage },
        { selector: `Literal[value=/${HAND_SURFACE}/]`, message: surfaceMessage },
        { selector: `TemplateElement[value.raw=/${HAND_SURFACE}/]`, message: surfaceMessage },
      ],
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
