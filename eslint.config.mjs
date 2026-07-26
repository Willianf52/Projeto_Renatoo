import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: currentDirectory });

const config = [
  {
    ignores: [".next/**", "node_modules/**", ".pnpm-store/**"],
  },
  ...compat.extends("next/core-web-vitals"),
];

export default config;
