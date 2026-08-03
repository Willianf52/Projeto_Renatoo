import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Espelha o "paths" de tsconfig.json (@/* -> ./*).
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // lib/env.ts exige essas envs; o vitest nao le .env.local como o Next faz.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example-test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
