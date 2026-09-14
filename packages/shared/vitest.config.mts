import { defineConfig } from "vitest/config";

/**
 * Ate aqui o pacote rodava com a config padrao do vitest. Este arquivo existe
 * so para a cobertura -- o resto continua no padrao.
 *
 * Mesma regra do painel (apps/web/vitest.config.mts): piso no numero de hoje,
 * arredondado para baixo, e sobe junto com a cobertura. Medido em 13/09/2026:
 * linhas 82,19%, statements 83,33%, branches 93,10%, functions 93,10%.
 *
 * O piso aqui pesa mais que nos apps: `packages/shared` e a fronteira
 * anti-drift entre painel e app de campo, e uma regra de campo sem teste neste
 * pacote quebra os dois lados de uma vez.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text-summary", "html"],
      thresholds: {
        lines: 82,
        statements: 83,
        branches: 93,
        functions: 93,
      },
    },
  },
});
