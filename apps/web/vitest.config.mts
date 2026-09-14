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
    // `pnpm test:cobertura` (a CI roda este). `pnpm test` segue sem medir,
    // para o ciclo local nao pagar a instrumentacao.
    //
    // PISO = NUMERO DE HOJE, NAO META. Medido em 13/09/2026: linhas 38,14%,
    // statements 38,35%, branches 39,14%, functions 36,11% -- arredondados
    // para o inteiro de baixo, para uma linha nova sem teste nao reprovar por
    // decimo. O que o piso barra e a cobertura CAIR: teste apagado, modulo
    // grande entrando sem teste nenhum. Subiu de verdade? Suba o piso junto,
    // no mesmo PR. Um piso aspiracional que ja falha no primeiro dia vira
    // `continue-on-error` na semana seguinte (P1-4 da auditoria de 11/09).
    //
    // Paginas e componentes `.tsx` entram na conta de proposito, e sao o que
    // puxa o numero para baixo: a cobertura deles vem do e2e, que o v8 do
    // vitest nao enxerga. Tira-los daqui daria um numero mais bonito e mais
    // falso.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts"],
      reporter: ["text-summary", "html"],
      thresholds: {
        lines: 38,
        statements: 38,
        branches: 39,
        functions: 36,
      },
    },
    // lib/env.ts exige essas envs; o vitest nao le .env.local como o Next faz.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example-test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
