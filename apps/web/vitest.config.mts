import { fileURLToPath } from "url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Espelha o "paths" de tsconfig.json (@/* -> ./src/*).
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // node, nao jsdom: a maior parte da suite e lib/ e Server Action, sem
    // DOM nenhum -- jsdom global deixaria a suite inteira mais lenta para
    // um ganho que so os testes de componente usam. Os poucos arquivos que
    // precisam de DOM (FilterDatePicker, FilterTimePicker) pedem jsdom por
    // conta propria via `// @vitest-environment jsdom` no topo do arquivo.
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // e2e/*.spec.ts sao specs do Playwright, nao do vitest -- o include
    // padrao do vitest casa com *.spec.ts tambem, e os dois usam `test`
    // e `describe` com assinatura incompativel (test.describe() do
    // Playwright so pode ser chamado pelo runner dele).
    exclude: [...configDefaults.exclude, "e2e/**"],
    // lib/env.ts exige essas envs; o vitest nao le .env.local como o Next faz.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example-test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
